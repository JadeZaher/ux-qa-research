// End-to-end self-test on localhost only: temp study + tiny HTTP app -> uxSession runs -> ux-report -> assertions.
// node self-test.mjs [playwright import path]   (or UXQA_PLAYWRIGHT). Touches no deployed environment.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const LIB_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PAGES = {
	'/': '<h1>Home</h1><a href="/next">Go next</a><button id="dead">Does nothing</button><label>Name <input name="name" required></label><input id="unlabelled">',
	'/next': '<h1>Next</h1><p>Done screen</p><button onclick="document.body.append(\'ok\')">Live</button>',
};
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	if (url.pathname === '/api/platform') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ deploymentKey: 'uxqa-self-test' })); }
	if (url.pathname === '/api/items') { res.writeHead(500); return res.end('{}'); }
	const body = PAGES[url.pathname];
	res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
	res.end(`<!doctype html><html lang="en"><head><title>t</title></head><body>${body || 'missing'}</body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'uxqa-self-test-'));
for (const f of ['src/routes/+page.svelte', 'src/routes/next/+page.svelte', 'src/routes/never/+page.svelte', 'src/routes/api/items/+server.ts']) { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), ''); }
const config = {
	baseUrl, guard: { path: '/api/platform', field: 'deploymentKey', equals: 'uxqa-self-test' },
	routes: { dir: 'src/routes', framework: 'sveltekit' }, browserChannel: process.env.UXQA_BROWSER_CHANNEL ?? 'chrome',
	playwright: process.argv[2] || process.env.UXQA_PLAYWRIGHT || 'playwright',
	goldTasks: [{ id: 'gold-reach-next', persona: 'anon', goal: 'Get to the next screen', success: { textVisible: 'Done screen' } }],
};
fs.mkdirSync(path.join(repo, 'uxqa'), { recursive: true });
fs.writeFileSync(path.join(repo, 'uxqa', 'study.md'), '---\ntype: UX Study\n---\n# self-test\n\n```json uxqa-config\n' + JSON.stringify(config, null, 1) + '\n```\n');
process.env.UXQA_STUDY_DIR = path.join(repo, 'uxqa');

let failure = null;
try {
	const { uxSession } = await import('./ux-lib.mjs');
	const ui = await uxSession({ task: 'explore', pass: '01-self-test' });
	await ui.page.goto(baseUrl + '/');
	ui.step('open home');
	const violations = await ui.axe();
	assert.ok(violations?.some((v) => v.id === 'label'), 'vendored axe-core flags the unlabelled input');
	await ui.page.click('#dead');
	await ui.page.waitForTimeout(1400);
	await ui.attempt('find a missing button', () => ui.page.click('#nope', { timeout: 300 }));
	await ui.request('GET', '/api/items');
	await ui.page.click('text=Go next');
	await ui.page.waitForLoadState('load');
	await ui.page.click('text=Live');
	const metrics = await ui.finish('PARTIAL');
	assert.equal(metrics.deadClicks, 1, 'the inert button is a dead click; the navigating link and the DOM-changing button are live');
	assert.equal(metrics.workarounds, 1, 'a direct API call in a ui-only run is a workaround');
	assert.equal(metrics.failedAttempts, 3);
	assert.ok(metrics.abandoned, 'exhausting the attempt budget records abandonment');
	assert.ok(fs.existsSync(path.join(repo, 'uxqa/passes/01-self-test/runs/anon--explore/trace.zip')), 'trace.zip per journey');

	const { runGold } = await import('./gold-tasks.mjs');
	const gold = await runGold('gold-reach-next', async (s) => { await s.page.click('text=Go next'); await s.page.waitForLoadState('load'); }, { pass: '01-self-test', handle: undefined });
	assert.equal(gold.outcome, 'COMPLETED', 'the predicate, not the driver, decides success');

	const out = execFileSync(process.execPath, [path.join(LIB_DIR, 'ux-report.mjs'), '01-self-test'], { env: process.env, encoding: 'utf8' });
	const report = JSON.parse(fs.readFileSync(path.join(repo, 'uxqa/passes/01-self-test/ux-report.json'), 'utf8'));
	assert.equal(report.coverage.pageRoutes, 3);
	assert.deepEqual(report.coverage.unvisited, ['/never']);
	assert.equal(report.coverage.api.hit, 1);
	assert.equal(report.goldTrend['gold-reach-next']['01-self-test'].successRate, 1);
	assert.ok(report.heatmap[0].friction > 0);
	assert.ok(report.axeRules.some((r) => r.id === 'label' && r.pages.includes('/')));
	console.log('SELF-TEST OK ' + out.split('\n').find((l) => l.includes('coverage')).trim());
} catch (error) {
	failure = error;
} finally {
	server.closeAllConnections();
	server.close();
	fs.rmSync(repo, { recursive: true, force: true });
}
if (failure) { console.error('SELF-TEST FAILED: ' + String(failure.message || failure).split('\n')[0]); process.exit(1); }
