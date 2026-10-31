// Gold-task harness: fixed, repeatable ui-only tasks whose outcome is judged by a success predicate, not by the agent.
// runGold(id, drive, { pass }) -> metrics.   CLI: node gold-tasks.mjs list | check | trend    see reference/friction-metrics.md sec. Gold tasks
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadStudy, listPasses } from './study-config.mjs';

/** Definition errors for one gold task; an empty list means it is runnable. */
export function validateGoldTask(task) {
	const problems = [];
	if (!/^gold-[a-z0-9-]+$/.test(task.id || '')) problems.push('id must match ^gold-[a-z0-9-]+$');
	if (!task.persona) problems.push('persona (a seeded handle) is required');
	if (!task.goal) problems.push('goal (user words, no UI hints) is required');
	const success = task.success || {};
	if (!success.urlMatches && !success.textVisible && !success.roleVisible) problems.push('success needs urlMatches, textVisible or roleVisible');
	return problems;
}

/** Evaluate the success predicate on the live page: every declared condition must hold. */
export async function goldSucceeded(page, success) {
	if (success.urlMatches && !new RegExp(success.urlMatches).test(new URL(page.url()).pathname)) return false;
	if (success.textVisible && !(await page.getByText(success.textVisible, { exact: false }).first().isVisible().catch(() => false))) return false;
	if (success.roleVisible) {
		const { role, name } = success.roleVisible;
		if (!(await page.getByRole(role, name ? { name } : {}).first().isVisible().catch(() => false))) return false;
	}
	return true;
}

/** Run one gold task as its persona: ui-only, standard attempt budget, time limit, predicate-judged outcome. */
export async function runGold(id, drive, { pass = process.env.UXQA_PASS, ...overrides } = {}) {
	const { study, uxSession } = await import('./ux-lib.mjs');
	const task = study.config.goldTasks.find((g) => g.id === id);
	if (!task) throw new Error(`unknown gold task ${id}; declare it in uxqa/study.md goldTasks`);
	const problems = validateGoldTask(task);
	if (problems.length) throw new Error(`${id}: ${problems.join('; ')}`);
	// Gold runs are always ui-only: a gold task finished through the API is not a success, it is a workaround.
	const session = await uxSession({ handle: task.persona, task: id, pass, ...(task.constraints || {}), ...overrides, mode: 'ui-only', attemptBudget: task.attemptBudget ?? study.config.attemptBudget });
	await session.page.goto(study.config.baseUrl + (task.start || '/'));
	session.step(`gold goal: ${task.goal}`);
	const limitMs = (task.maxSeconds ?? 300) * 1000;
	let timedOut = false, crashed = null, timer;
	await Promise.race([
		Promise.resolve().then(() => drive(session, task)).catch((error) => { crashed = String(error.message || error).slice(0, 200); }),
		new Promise((resolve) => { timer = setTimeout(() => { timedOut = true; resolve(); }, limitMs); }),
	]);
	clearTimeout(timer); // a pending limit timer would keep the process alive for maxSeconds after a fast success
	const passed = !timedOut && !crashed && (await goldSucceeded(session.page, task.success));
	const outcome = passed ? 'COMPLETED' : timedOut ? 'ABANDONED' : crashed ? 'BLOCKED' : 'PARTIAL';
	return session.finish(outcome, timedOut ? `time limit ${task.maxSeconds ?? 300}s` : crashed || '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const study = loadStudy();
	const command = process.argv[2] || 'list';
	if (command === 'list') {
		// Briefs for lane agents: goal and start only; the predicate stays hidden so agents cannot steer at it.
		console.log(JSON.stringify(study.config.goldTasks.map(({ id, persona, start, goal, constraints, maxSeconds }) => ({ id, persona, start: start || '/', goal, constraints, maxSeconds: maxSeconds ?? 300 })), null, 1));
	} else if (command === 'check') {
		const report = study.config.goldTasks.map((g) => ({ id: g.id, problems: validateGoldTask(g) }));
		console.log(JSON.stringify(report, null, 1));
		if (!report.length || report.some((r) => r.problems.length)) process.exit(1);
	} else if (command === 'trend') {
		const passes = listPasses(study);
		const latest = passes.reverse().map((p) => path.join(study.studyDir, 'passes', p, 'ux-report.json')).find((f) => fs.existsSync(f));
		console.log(latest ? JSON.stringify(JSON.parse(fs.readFileSync(latest, 'utf8')).goldTrend, null, 1) : 'no ux-report.json yet');
	} else {
		console.error('usage: node gold-tasks.mjs list | check | trend');
		process.exit(1);
	}
}
