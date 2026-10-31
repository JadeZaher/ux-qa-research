// Friction metrics and the friction score: pure functions shared by ux-lib (per run) and ux-report (per route, per pass).
// Definitions and the rationale for every weight: reference/friction-metrics.md

/** Weights of the friction score; changing one invalidates cross-pass trends, so bump FRICTION_VERSION with it. */
export const FRICTION_WEIGHTS = { abandons: 10, workarounds: 6, rageClicks: 3, errors: 2, deadClicks: 2, axe: 1 };
export const FRICTION_VERSION = 1;

/** Weighted sum over a counter object that uses the FRICTION_WEIGHTS keys. */
export function frictionScore(counts) {
	return Object.entries(FRICTION_WEIGHTS).reduce((sum, [key, weight]) => sum + weight * (counts[key] || 0), 0);
}

/** A click is a rage click when at least two of the previous three clicks landed within 1 s and 30 px of it. */
export function isRageClick(clicks, i) {
	const click = clicks[i];
	return clicks.filter((prior, j) => j > i - 3 && j < i && click.t - prior.t < 1000 && Math.hypot(click.x - prior.x, click.y - prior.y) < 30).length >= 2;
}

export const countRageClicks = (clicks) => clicks.filter((_, i) => isRageClick(clicks, i)).length;

/** Friction metrics from one run log (the shape ux-lib writes to ux.json). */
export function frictionMetrics(log) {
	const clicks = log.pageEvents.filter((e) => e.type === 'click');
	const paths = log.navigations.map((n) => n.path);
	const httpErrors = log.errors.filter((e) => e.kind === 'http').length;
	const consoleErrors = log.errors.filter((e) => e.kind === 'console').length + log.pageEvents.filter((e) => e.type === 'jserror').length;
	const failedAttempts = Object.values(log.attempts).reduce((n, a) => n + a.tries - (a.ok ? 1 : 0), 0);
	const metrics = {
		outcome: log.outcome,
		seconds: Math.round((log.endedAt - log.startedAt) / 1000),
		clicks: clicks.length,
		deadClicks: clicks.filter((c) => c.dead).length,
		rageClicks: countRageClicks(clicks),
		inputs: log.pageEvents.filter((e) => e.type === 'input').length,
		validationErrors: log.pageEvents.filter((e) => e.type === 'invalid').length,
		pageViews: paths.length,
		distinctPages: new Set(paths).size,
		revisits: paths.filter((p, i) => paths.indexOf(p) < i).length,
		httpErrors,
		consoleErrors,
		failedAttempts,
		workarounds: log.workarounds.length,
		abandoned: log.abandoned,
		axeViolations: log.axe.reduce((n, a) => n + (a.violations || []).length, 0),
		apiCalls: (log.apiCalls || []).length,
	};
	metrics.friction = frictionScore({
		abandons: log.abandoned || log.outcome === 'ABANDONED' ? 1 : 0,
		workarounds: metrics.workarounds,
		rageClicks: metrics.rageClicks,
		errors: httpErrors + consoleErrors + failedAttempts,
		deadClicks: metrics.deadClicks,
		axe: metrics.axeViolations,
	});
	return metrics;
}

/** Median of a numeric list (upper median for even lengths), null when empty. */
export const median = (values) => (values.length ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] : null);
