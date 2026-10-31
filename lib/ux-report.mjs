// Aggregates passes/<pass>/runs/**/ux.json into coverage, a per-route friction heatmap, per-task scorecards, gold-task trends and exit checks.
// node ux-report.mjs <pass>   -> writes passes/<pass>/ux-report.json and prints a summary.   Metric definitions: reference/friction-metrics.md
import fs from 'node:fs';
import path from 'node:path';
import { loadStudy, listPasses } from './study-config.mjs';
import { FRICTION_VERSION, frictionScore, isRageClick, median } from './friction.mjs';
import { routeInventory } from './route-inventory.mjs';

const study = loadStudy();
const passArg = process.argv[2];
if (!passArg) { console.error('usage: node ux-report.mjs <pass id, e.g. 03-onboarding or 3>'); process.exit(1); }
const passDir = study.passDir(passArg);
const pass = path.basename(passDir);
const { config } = study;

const inventory = routeInventory({ dir: study.resolve(config.routes.dir), framework: config.routes.framework, ignorePrefix: config.routes.ignorePrefix });
const pageOf = inventory.pageOf;

function runsFor(dir) {
	const base = path.join(dir, 'runs');
	if (!fs.existsSync(base)) return [];
	return fs.readdirSync(base).map((d) => path.join(base, d, 'ux.json')).filter((f) => fs.existsSync(f)).map((f) => ({ ...JSON.parse(fs.readFileSync(f, 'utf8')), runDir: path.relative(study.studyDir, path.dirname(f)) }));
}

const runs = runsFor(passDir);
const visited = new Map();
const unmatched = new Set();
const heat = {};
const bump = (p, key) => {
	const id = pageOf(p);
	if (id.startsWith('UNMATCHED:')) unmatched.add(id.slice(10));
	(heat[id] ??= { abandons: 0, workarounds: 0, rageClicks: 0, errors: 0, deadClicks: 0, axe: 0, revisits: 0 })[key]++;
};
for (const r of runs) {
	const seen = new Set();
	for (const n of r.navigations) {
		const id = pageOf(n.path);
		visited.set(id, (visited.get(id) || 0) + 1);
		if (seen.has(id)) bump(n.path, 'revisits'); else seen.add(id);
	}
	for (const e of r.pageEvents) {
		if (e.type === 'click' && e.dead) bump(e.path, 'deadClicks');
		if (e.type === 'jserror') bump(e.path, 'errors');
	}
	// Rage clicks are attributed to the route of the click that completed the burst.
	const clicks = r.pageEvents.filter((e) => e.type === 'click');
	clicks.forEach((c, i) => { if (isRageClick(clicks, i)) bump(c.path, 'rageClicks'); });
	for (const e of r.errors) if (e.path) bump(e.path, 'errors');
	for (const w of r.workarounds) bump(w.path, 'workarounds');
	if (r.abandoned) bump(r.abandoned.path, 'abandons');
	else if (r.outcome === 'ABANDONED') bump(r.navigations.at(-1)?.path || '/', 'abandons');
	for (const a of r.axe) for (const _ of a.violations || []) bump(a.path, 'axe');
}
const heatmap = Object.entries(heat).map(([route, h]) => ({ route, ...h, friction: frictionScore(h) })).sort((a, b) => b.friction - a.friction);
const tasks = runs.map((r) => ({ persona: r.handle, task: r.task, mode: r.mode, constraints: r.constraints || [], runDir: r.runDir, ...r.metrics }));
const uxTasks = tasks.filter((t) => t.mode === 'ui-only');
const axeRules = {};
for (const r of runs) for (const a of r.axe) for (const v of a.violations || []) (axeRules[v.id] ??= { impact: v.impact, help: v.help, pages: new Set() }).pages.add(pageOf(a.path));

// API coverage: declared endpoints (file router or a tRPC procedures file) against operations observed in the network log.
const observedOps = new Map();
for (const r of runs) for (const c of r.apiCalls || []) observedOps.set(c.op, (observedOps.get(c.op) || 0) + 1);
let declaredApis = inventory.apis.map((a) => a.id);
let apiHit = (id) => runs.some((r) => (r.apiCalls || []).some((c) => c.path && inventory.apiOf(c.path) === id));
if (config.api.style === 'trpc' && config.api.proceduresFile && fs.existsSync(study.resolve(config.api.proceduresFile))) {
	declaredApis = JSON.parse(fs.readFileSync(study.resolve(config.api.proceduresFile), 'utf8'));
	apiHit = (id) => observedOps.has(id);
}

// Gold tasks: same task id across passes -> success rate and median effort trend. Only ui-only runs of DECLARED gold ids count
// (a lane naming an exploration run "gold-..." must not become an undeclared gold task).
const declaredGold = config.goldTasks.map((g) => g.id);
const isDeclaredGold = new Set(declaredGold);
const passes = listPasses(study);
const upTo = passes.includes(pass) ? passes.slice(0, passes.indexOf(pass) + 1) : [...passes, pass];
const gold = {};
const frictionByPass = {};
for (const p of upTo) {
	const passRuns = runsFor(path.join(study.studyDir, 'passes', p)).filter((r) => r.mode === 'ui-only');
	if (passRuns.length) frictionByPass[p] = passRuns.reduce((n, r) => n + (r.metrics.friction || 0), 0) / passRuns.length;
	for (const r of passRuns) if (isDeclaredGold.has(r.task)) {
		const g = ((gold[r.task] ??= {})[p] ??= { runs: 0, completed: 0, clicks: [], seconds: [], friction: [] });
		g.runs++; if (r.metrics.outcome === 'COMPLETED') g.completed++;
		g.clicks.push(r.metrics.clicks); g.seconds.push(r.metrics.seconds); g.friction.push(r.metrics.friction || 0);
	}
}
const goldTrend = Object.fromEntries(Object.entries(gold).map(([t, byPass]) => [t, Object.fromEntries(Object.entries(byPass).map(([p, g]) => [p, { runs: g.runs, successRate: g.completed / g.runs, medianClicks: median(g.clicks), medianSeconds: median(g.seconds), medianFriction: median(g.friction) }]))]));

// Exit checks this report can decide; the ledger supplies new HIGH defects, the coordinator supplies review + re-run status.
const frictionPerJourney = uxTasks.length ? uxTasks.reduce((n, t) => n + (t.friction || 0), 0) / uxTasks.length : null;
const previousPass = upTo.slice(0, -1).reverse().find((p) => frictionByPass[p] != null) || null;
const previousFriction = previousPass ? frictionByPass[previousPass] : null;
const goldNow = Object.entries(goldTrend).map(([t, byPass]) => ({ task: t, ...(byPass[pass] || { runs: 0, successRate: null }) }));
const ledgerFile = path.join(passDir, 'ledger.json');
const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : null;
const ledgerEntries = ledger ? (Array.isArray(ledger) ? ledger : ledger.entries || []) : null;
const newHigh = ledgerEntries ? ledgerEntries.filter((d) => /BLOCKER|HIGH/.test(d.severity) && (d.introducedIn || pass) === pass && !/NOT_A_BUG|DUPLICATE/.test(d.decision || '') && d.status !== 'FIXED').length : null;
const routeRatio = inventory.pages.length ? [...visited.keys()].filter((k) => !k.startsWith('UNMATCHED')).length / inventory.pages.length : null;
const exitChecks = {
	goldSuccess: { target: config.targets.goldSuccess, missing: declaredGold.filter((id) => !goldNow.some((g) => g.task === id && g.runs)), below: goldNow.filter((g) => g.successRate != null && g.successRate < config.targets.goldSuccess).map((g) => g.task) },
	frictionTrend: { previousPass, previous: previousFriction, current: frictionPerJourney, tolerance: config.targets.frictionTolerance, ok: previousFriction == null || frictionPerJourney == null ? null : frictionPerJourney <= previousFriction * (1 + config.targets.frictionTolerance) },
	newHigh: { target: config.targets.newHigh, count: newHigh, ok: newHigh == null ? null : newHigh <= config.targets.newHigh },
	routeCoverage: { target: config.targets.routeCoverage, ratio: routeRatio, ok: config.targets.routeCoverage == null ? null : routeRatio >= config.targets.routeCoverage },
};
exitChecks.goldSuccess.ok = exitChecks.goldSuccess.missing.length === 0 && exitChecks.goldSuccess.below.length === 0;

const report = {
	pass, frictionVersion: FRICTION_VERSION, generatedAt: new Date().toISOString(), runs: runs.length, uxRuns: uxTasks.length, probeRuns: tasks.length - uxTasks.length,
	coverage: {
		framework: inventory.framework,
		pageRoutes: inventory.pages.length,
		visited: [...visited.keys()].filter((k) => !k.startsWith('UNMATCHED')).length,
		unvisited: inventory.pages.map((r) => r.id).filter((id) => !visited.has(id)),
		unmatchedPaths: [...unmatched].slice(0, 50),
		api: { declared: declaredApis.length, hit: declaredApis.filter(apiHit).length, unhit: declaredApis.filter((id) => !apiHit(id)), observedOps: Object.fromEntries([...observedOps].sort((a, b) => b[1] - a[1]).slice(0, 80)) },
	},
	outcomes: uxTasks.reduce((o, t) => ((o[t.outcome] = (o[t.outcome] || 0) + 1), o), {}),
	totals: uxTasks.reduce((s, t) => { for (const k of ['clicks', 'deadClicks', 'rageClicks', 'workarounds', 'httpErrors', 'consoleErrors', 'failedAttempts', 'axeViolations', 'friction']) s[k] = (s[k] || 0) + (t[k] || 0); return s; }, {}),
	frictionPerJourney,
	heatmap: heatmap.slice(0, 40),
	tasks,
	axeRules: Object.entries(axeRules).map(([id, v]) => ({ id, impact: v.impact, help: v.help, pages: [...v.pages] })).sort((a, b) => b.pages.length - a.pages.length),
	goldTrend,
	frictionByPass,
	exitChecks,
};
fs.mkdirSync(passDir, { recursive: true });
fs.writeFileSync(path.join(passDir, 'ux-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ pass, runs: report.runs, uxRuns: report.uxRuns, coverage: `${report.coverage.visited}/${report.coverage.pageRoutes} pages, ${report.coverage.api.hit}/${report.coverage.api.declared} apis`, outcomes: report.outcomes, frictionPerJourney, topFriction: heatmap.slice(0, 8).map((h) => `${h.route} (${h.friction})`), exit: Object.fromEntries(Object.entries(exitChecks).map(([k, v]) => [k, v.ok])) }, null, 1));
