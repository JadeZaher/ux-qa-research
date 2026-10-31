// Friction metric derivation: each row is a run log shape and the metrics it must produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frictionMetrics, frictionScore, countRageClicks, FRICTION_WEIGHTS } from '../friction.mjs';

const click = (t, x, y, extra = {}) => ({ type: 'click', t, x, y, path: '/a', ...extra });
const baseLog = (over = {}) => ({ startedAt: 0, endedAt: 61_000, outcome: 'COMPLETED', pageEvents: [], navigations: [], errors: [], attempts: {}, workarounds: [], axe: [], abandoned: null, ...over });

test('rage clicks: a burst of three within 1 s and 30 px counts once; spread clicks do not', () => {
	const rows = [
		[[click(0, 10, 10), click(200, 12, 11), click(400, 11, 12)], 1],
		[[click(0, 10, 10), click(200, 12, 11), click(400, 11, 12), click(600, 10, 10)], 2],
		[[click(0, 10, 10), click(1500, 10, 10), click(3000, 10, 10)], 0],
		[[click(0, 10, 10), click(100, 200, 10), click(200, 400, 10)], 0],
	];
	for (const [clicks, expected] of rows) assert.equal(countRageClicks(clicks), expected);
});

test('metrics: dead clicks, revisits, errors, failed attempts, workarounds and the weighted score', () => {
	const log = baseLog({
		pageEvents: [click(0, 1, 1, { dead: true }), click(5000, 300, 300), { type: 'jserror', t: 1 }, { type: 'invalid', t: 2 }],
		navigations: [{ path: '/a' }, { path: '/b' }, { path: '/a' }],
		errors: [{ kind: 'http', path: '/a' }, { kind: 'console', path: '/a' }, { kind: 'attempt', path: '/a' }],
		attempts: { save: { tries: 3, ok: true }, publish: { tries: 3, ok: false } },
		workarounds: [{ why: 'api' }],
		abandoned: { name: 'publish', path: '/b', afterTries: 3 },
		axe: [{ path: '/a', violations: [{ id: 'label' }, { id: 'color-contrast' }] }],
	});
	const m = frictionMetrics(log);
	assert.deepEqual(
		{ seconds: m.seconds, clicks: m.clicks, deadClicks: m.deadClicks, revisits: m.revisits, distinctPages: m.distinctPages, httpErrors: m.httpErrors, consoleErrors: m.consoleErrors, failedAttempts: m.failedAttempts, validationErrors: m.validationErrors, axeViolations: m.axeViolations },
		{ seconds: 61, clicks: 2, deadClicks: 1, revisits: 1, distinctPages: 2, httpErrors: 1, consoleErrors: 2, failedAttempts: 5, validationErrors: 1, axeViolations: 2 },
	);
	// abandons 1*10 + workarounds 1*6 + errors (1 http + 2 console + 5 failed) * 2 + dead 1*2 + axe 2*1
	assert.equal(m.friction, 10 + 6 + 16 + 2 + 2);
});

test('an ABANDONED outcome without a recorded attempt still counts as one abandonment', () => {
	assert.equal(frictionMetrics(baseLog({ outcome: 'ABANDONED' })).friction, FRICTION_WEIGHTS.abandons);
	assert.equal(frictionScore({}), 0);
});
