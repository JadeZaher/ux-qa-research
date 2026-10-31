// Session adapter for apps with pre-existing test accounts: signs each persona in through the real login form, saves Playwright storage state.
// Usage: node adapter.mjs guard | seed <personas.json> <out.json>     password from env UXQA_TEST_PASSWORD (never argv). See reference/session-adapters.md
// Persona seed fields used: seed.email (default <handle>@example.com). Adjust the three selectors to your login form.
import fs from 'node:fs';
import path from 'node:path';

const PLUGIN_LIB = process.env.UXQA_PLUGIN_LIB; // absolute path to the plugin's lib/ (setup writes it into the study config)
const { loadStudy, importPlaywright } = await import(new URL('file:///' + PLUGIN_LIB.replace(/\\/g, '/') + '/study-config.mjs').href);
const { assertTestTarget } = await import(new URL('file:///' + PLUGIN_LIB.replace(/\\/g, '/') + '/guard.mjs').href);
const SELECTORS = { email: 'input[type=email], input[name=email]', password: 'input[type=password]', submit: 'button[type=submit]' };
const LOGIN_PATH = process.env.UXQA_LOGIN_PATH || '/login';

const study = loadStudy();
const [command, personasFile, outFile] = process.argv.slice(2);
try {
	await assertTestTarget(study);
} catch (error) {
	console.log(String(error.message).split('\n')[0]);
	process.exit(2);
}
if (command === 'guard') { console.log('OK ' + study.config.baseUrl); process.exit(0); }
if (command !== 'seed' || !personasFile || !outFile) { console.log('usage: adapter.mjs guard | seed <personas.json> <out.json>'); process.exit(1); }
const password = process.env.UXQA_TEST_PASSWORD;
if (!password) { console.log('UXQA_TEST_PASSWORD not set'); process.exit(1); }

const { chromium } = await importPlaywright(study);
const browser = await chromium.launch({ headless: true });
const stateDir = path.join(path.dirname(path.resolve(outFile)), 'state');
fs.mkdirSync(stateDir, { recursive: true });
const sessions = [];
let failed = 0;
for (const persona of JSON.parse(fs.readFileSync(personasFile, 'utf8')).personas) {
	if (!/^qa-[a-z0-9-]+$/.test(persona.handle)) { failed++; continue; }
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await page.goto(study.config.baseUrl + LOGIN_PATH);
		await page.fill(SELECTORS.email, persona.seed?.email || `${persona.handle}@example.com`);
		await page.fill(SELECTORS.password, password);
		await Promise.all([page.waitForLoadState('networkidle'), page.click(SELECTORS.submit)]);
		const stateFile = path.join(stateDir, `${persona.handle}.json`);
		await context.storageState({ path: stateFile });
		sessions.push({ handle: persona.handle, storageState: path.relative(study.repoRoot, stateFile).replace(/\\/g, '/') });
	} catch {
		failed++; // the error text may contain the filled form; report a count only
	}
	await context.close();
}
await browser.close();
fs.writeFileSync(outFile, JSON.stringify(sessions, null, 1));
console.log(`SEEDED ${sessions.length}${failed ? ` FAILED ${failed}` : ''}`);
process.exit(failed ? 1 : 0);
