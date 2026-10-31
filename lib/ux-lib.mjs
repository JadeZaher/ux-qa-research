// Instrumented persona sessions for UX research: Playwright trace + in-page event observer + friction metrics (+ axe if vendored).
// uxSession({ handle, task, pass, mode, width, locale, slow, keyboardOnly, zoom }) -> { page, step, attempt, workaround, request, trpc, axe, shot, text, outline, finish }
// Config comes from uxqa/study.md (lib/study-config.mjs); rationale in lib/AGENTS.md and reference/friction-metrics.md.
import fs from 'node:fs';
import path from 'node:path';
import { loadStudy, importPlaywright } from './study-config.mjs';
import { assertTestTarget } from './guard.mjs';
import { frictionMetrics } from './friction.mjs';

export const study = loadStudy();
export const BASE = study.config.baseUrl;
const { chromium } = await importPlaywright(study);
const LIB_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// axe-core (MPL-2.0) ships in the plugin's vendor/; a study may pin another build with config.axePath.
const AXE_CANDIDATES = [study.config.axePath && study.resolve(study.config.axePath), path.join(LIB_DIR, '..', 'vendor', 'axe.min.js')].filter(Boolean);

// Injected before any page script: records clicks, inputs, navigations, DOM change and request activity per click (dead/rage click detection).
const OBSERVER = () => {
	// Events stream to Node through the exposed binding: a full navigation would wipe anything kept in window.
	const ux = (window.__ux = window.__ux || { pending: 0, seq: 0 });
	const emit = (ev) => { try { window.__uxEmit(ev); } catch {} };
	const now = () => performance.timeOrigin + performance.now();
	const label = (el) => (el?.getAttribute?.('aria-label') || el?.innerText || el?.getAttribute?.('name') || el?.tagName || '').toString().trim().slice(0, 60);
	const origFetch = window.fetch;
	window.fetch = (...a) => { ux.pending++; ux.lastNet = now(); return origFetch(...a).finally(() => { ux.pending--; ux.lastNet = now(); }); };
	let lastMut = 0;
	new MutationObserver(() => { lastMut = now(); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	document.addEventListener('click', (e) => {
		const t = now(), el = e.target.closest('a,button,[role=button],input,select,textarea,label,summary') || e.target;
		const id = `${t}-${ux.seq++}`, url0 = location.href;
		// detail > 0 means a pointer produced the click; keyboard activation (Enter/Space) reports detail 0.
		emit({ type: 'click', id, t, x: e.clientX, y: e.clientY, pointer: e.detail > 0, label: label(el), tag: el.tagName, path: location.pathname });
		(ux.pendingClicks ??= new Set()).add(id);
		setTimeout(() => { ux.pendingClicks.delete(id); emit({ type: 'clickResult', id, dead: lastMut < t && !(ux.lastNet > t) && location.href === url0 }); }, 1200);
	}, true);
	// A page that unloads before the verdict timer fired means the click navigated: it was live.
	window.addEventListener('pagehide', () => { for (const id of ux.pendingClicks ?? []) emit({ type: 'clickResult', id, dead: false }); });
	document.addEventListener('change', (e) => emit({ type: 'input', t: now(), label: label(e.target), path: location.pathname }), true);
	document.addEventListener('invalid', (e) => emit({ type: 'invalid', t: now(), label: label(e.target), path: location.pathname }), true);
	window.addEventListener('error', (e) => emit({ type: 'jserror', t: now(), msg: String(e.message).slice(0, 200), path: location.pathname }));
};

/** Persona session record from the sessions file; secrets stay inside this function and never reach logs. */
function loadSession(handle) {
	const file = study.resolve(study.config.session.sessionsFile);
	if (!fs.existsSync(file)) throw new Error(`sessions file missing (${path.relative(study.repoRoot, file)}); run the session adapter seed step`);
	const record = JSON.parse(fs.readFileSync(file, 'utf8')).find((x) => x.handle === handle);
	if (!record) throw new Error(`no session for ${handle}; re-run the adapter seed step (never mint sessions from a lane)`);
	return record;
}

async function newPersonaContext(browser, handle, contextOptions) {
	const record = handle ? loadSession(handle) : null;
	if (record?.storageState) {
		const storageState = typeof record.storageState === 'string' ? study.resolve(record.storageState) : record.storageState;
		return browser.newContext({ ...contextOptions, storageState });
	}
	const context = await browser.newContext(contextOptions);
	if (record?.cookie || record?.cookies) {
		const secure = BASE.startsWith('https:');
		const domain = study.config.session.cookieDomain || new URL(BASE).hostname;
		const cookies = record.cookies || [{ name: study.config.session.cookieName, value: record.cookie }];
		await context.addCookies(cookies.map((c) => ({ domain, path: '/', httpOnly: true, secure, sameSite: 'Lax', ...c })));
	}
	return context;
}

const slug = (text) => String(text || 'anon').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80);
const API_PREFIXES = study.config.api.prefixes;

/** Operation key for an observed API request: tRPC procedure names (batched calls split) or METHOD + id-normalised path. */
function apiOps(method, pathname) {
	if (study.config.api.style === 'trpc' && pathname.startsWith(study.config.api.trpcPrefix)) {
		return decodeURIComponent(pathname.slice(study.config.api.trpcPrefix.length)).split(',').filter(Boolean).map((proc) => ({ method, op: proc }));
	}
	if (!API_PREFIXES.some((p) => pathname.startsWith(p))) return [];
	const normalised = pathname.split('/').map((s) => (/^\d+$|^[0-9a-f-]{32,36}$|^[a-z0-9]{20,}$/i.test(s) ? ':id' : s)).join('/');
	return [{ method, op: `${method} ${normalised}`, path: pathname }];
}

export async function uxSession({ handle, task, pass = process.env.UXQA_PASS, mode = 'ui-only', width = 1366, height = 900, locale, slow = false, keyboardOnly = false, zoom = 1, attemptBudget = study.config.attemptBudget } = {}) {
	if (!task) throw new Error('uxSession needs a task id (gold tasks start with "gold-")');
	if (!pass) throw new Error('uxSession needs a pass id (option pass or env UXQA_PASS)');
	if (!['ui-only', 'probe'].includes(mode)) throw new Error('mode must be ui-only or probe');
	await assertTestTarget(study);
	if (handle) loadSession(handle); // fail in milliseconds, before any browser exists (a missing seed used to leak a chromium per lane)
	const runDir = path.join(study.passDir(pass), 'runs', `${slug(handle)}--${slug(task)}`) + path.sep;
	fs.mkdirSync(runDir, { recursive: true });
	const browser = await chromium.launch({ ...(study.config.browserChannel ? { channel: study.config.browserChannel } : {}), headless: true });
	// 200% zoom is modelled as half the CSS viewport at twice the pixel density, which is what the browser does.
	const contextOptions = { viewport: { width: Math.round(width / zoom), height: Math.round(height / zoom) }, deviceScaleFactor: zoom, locale, reducedMotion: 'reduce' };
	const context = await newPersonaContext(browser, handle, contextOptions);
	const pageEvents = [];
	await context.exposeBinding('__uxEmit', (_src, ev) => {
		if (ev.type === 'clickResult') { const c = pageEvents.find((x) => x.id === ev.id); if (c) c.dead = ev.dead; }
		else pageEvents.push(ev);
	});
	await context.addInitScript(OBSERVER);
	await context.tracing.start({ screenshots: true, snapshots: true, sources: false, title: `${handle} ${task}` });
	const page = await context.newPage();
	if (slow) { const cdp = await context.newCDPSession(page); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 200_000, uploadThroughput: 100_000 }); }
	const constraints = [width / zoom < 500 && 'mobile', zoom > 1 && `zoom${Math.round(zoom * 100)}`, locale, slow && 'slow', keyboardOnly && 'keyboard'].filter(Boolean);
	const log = { handle, task, pass, mode, width, zoom, locale, slow, keyboardOnly, constraints, startedAt: Date.now(), steps: [], navigations: [], workarounds: [], probes: [], apiCalls: [], attempts: {}, abandoned: null, errors: [], axe: [], outcome: null };
	page.on('framenavigated', (f) => { if (f === page.mainFrame()) log.navigations.push({ t: Date.now(), path: safePath(page) }); });
	page.on('console', (m) => { if (m.type() === 'error') log.errors.push({ kind: 'console', msg: m.text().slice(0, 300), path: safePath(page) }); });
	page.on('request', (r) => { if (r.url().startsWith(BASE)) for (const op of apiOps(r.method(), new URL(r.url()).pathname)) log.apiCalls.push({ t: Date.now(), ...op, from: safePath(page) }); });
	page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) log.errors.push({ kind: 'http', status: r.status(), url: r.url().slice(BASE.length, BASE.length + 160).split('?')[0], path: safePath(page) }); });

	/** Direct API call from the page: a capability probe in probe mode, HARD friction (a workaround) in ui-only mode. */
	const request = async (method, url, body) => {
		const entry = { t: Date.now(), why: `${method} ${url} in a ui-only run`, path: safePath(page) };
		if (mode === 'ui-only') log.workarounds.push(entry); else log.probes.push({ t: entry.t, method, url, path: entry.path });
		return page.evaluate(async ({ method, url, body }) => {
			const res = await fetch(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
			return { status: res.status, body: await res.json().catch(() => null) };
		}, { method, url, body });
	};

	return {
		page,
		/** Narrate a user-visible step; keep these at the level a real user would describe ("open my course", "submit the exam"). */
		step: (what) => log.steps.push({ t: Date.now(), what, path: safePath(page) }),
		/** Run one try at a sub-goal; after attemptBudget failures the persona abandons it (recorded, returns false). */
		attempt: async (name, fn) => {
			const a = (log.attempts[name] ??= { tries: 0, ok: false });
			while (a.tries < attemptBudget && !a.ok) {
				a.tries++;
				try { await fn(); a.ok = true; } catch (e) { log.errors.push({ kind: 'attempt', name, msg: String(e).slice(0, 200), path: safePath(page) }); }
			}
			if (!a.ok && !log.abandoned) log.abandoned = { name, path: safePath(page), afterTries: a.tries };
			return a.ok;
		},
		/** Call when the UI could not do it and you used the API or source knowledge instead: this is HARD friction. */
		workaround: (why) => log.workarounds.push({ t: Date.now(), why, path: safePath(page) }),
		request,
		/** tRPC call at <trpcPrefix><procedure> with the superjson envelope {json: input}; same friction rule as request(). */
		trpc: async (procedure, input, kind = 'query') => {
			const prefix = study.config.api.trpcPrefix;
			const envelope = { json: input ?? null };
			return kind === 'query' ? request('GET', `${prefix}${procedure}?input=${encodeURIComponent(JSON.stringify(envelope))}`) : request('POST', `${prefix}${procedure}`, envelope);
		},
		/** WCAG 2.0 A/AA + 2.1 AA scan of the current page with the vendored axe-core; violations are kept per route. */
		axe: async () => {
			const axePath = AXE_CANDIDATES.find((p) => fs.existsSync(p));
			if (!axePath) return null;
			await page.addScriptTag({ content: fs.readFileSync(axePath, 'utf8') });
			const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })));
			log.axe.push({ path: safePath(page), violations: r });
			return r;
		},
		shot: async (name) => { const p = `${runDir}${slug(name)}.png`; await page.screenshot({ path: p, fullPage: true }); return p; },
		/** Visible text only: the perception channel of a low-literacy or text-only persona. */
		text: async (max = 3000) => (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(0, max),
		/** Accessibility tree (ARIA snapshot): the perception channel of a screen-reader persona. */
		outline: async (max = 6000) => (await page.locator('body').ariaSnapshot()).slice(0, max),
		/** outcome: COMPLETED | PARTIAL | ABANDONED | BLOCKED. Writes trace.zip + ux.json and returns the metrics. */
		finish: async (outcome, note = '') => {
			await page.waitForTimeout(1300); // let the last click's dead-click verdict arrive
			await context.tracing.stop({ path: runDir + 'trace.zip' });
			await browser.close();
			if (keyboardOnly) for (const c of pageEvents.filter((e) => e.type === 'click' && e.pointer)) log.workarounds.push({ t: Date.now(), why: `pointer click "${c.label}" in a keyboard-only run`, path: c.path });
			log.outcome = outcome; log.note = String(note).slice(0, 500); log.endedAt = Date.now(); log.pageEvents = pageEvents;
			const metrics = frictionMetrics(log);
			fs.writeFileSync(runDir + 'ux.json', JSON.stringify({ ...log, metrics }, null, 1));
			return metrics;
		},
	};
}

function safePath(page) { try { return new URL(page.url()).pathname; } catch { return ''; } }

export { frictionMetrics };
