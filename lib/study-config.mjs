// Study configuration loader: finds uxqa/study.md, parses its ```json uxqa-config block, applies UXQA_* env overrides.
// loadStudy() -> { studyDir, repoRoot, config, passDir(id), resolve(p) }   see lib/AGENTS.md sec. study-config
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const CONFIG_BLOCK = /```json\s+uxqa-config\s*\r?\n([\s\S]*?)\r?\n```/;

/** Walk up from start until a directory containing uxqa/study.md is found. */
export function findStudyDir(start = process.cwd()) {
	if (process.env.UXQA_STUDY_DIR) return path.resolve(process.env.UXQA_STUDY_DIR);
	let dir = path.resolve(start);
	for (;;) {
		if (fs.existsSync(path.join(dir, 'uxqa', 'study.md'))) return path.join(dir, 'uxqa');
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error('no uxqa/study.md found above ' + start + ' (set UXQA_STUDY_DIR or run /ux-qa-research:setup)');
		dir = parent;
	}
}

/** Parse the machine config block out of study.md (the markdown around it is for humans). */
export function parseStudyConfig(markdown) {
	const match = CONFIG_BLOCK.exec(markdown);
	if (!match) throw new Error('study.md has no ```json uxqa-config block');
	return JSON.parse(match[1]);
}

const ENV_OVERRIDES = {
	UXQA_BASE_URL: (c, v) => { c.baseUrl = v; },
	UXQA_SESSIONS_FILE: (c, v) => { c.session.sessionsFile = v; },
	UXQA_COOKIE_NAME: (c, v) => { c.session.cookieName = v; },
	UXQA_COOKIE_DOMAIN: (c, v) => { c.session.cookieDomain = v; },
	UXQA_ROUTES_DIR: (c, v) => { c.routes.dir = v; },
	UXQA_FRAMEWORK: (c, v) => { c.routes.framework = v; },
	UXQA_PLAYWRIGHT: (c, v) => { c.playwright = v; },
	UXQA_BROWSER_CHANNEL: (c, v) => { c.browserChannel = v; },
};

/** Defaults for every optional field, so callers never branch on missing objects. */
function withDefaults(raw) {
	const config = structuredClone(raw);
	config.session = { cookieName: 'session', cookieDomain: null, sessionsFile: 'uxqa/.secrets/sessions.json', ...(config.session || {}) };
	config.routes = { dir: 'src/routes', framework: 'auto', ignorePrefix: null, ...(config.routes || {}) };
	config.api = { style: 'rest', prefixes: ['/api/'], trpcPrefix: '/api/', proceduresFile: null, ...(config.api || {}) };
	config.goldTasks = config.goldTasks || [];
	config.targets = { goldSuccess: 0.8, newHigh: 0, frictionTolerance: 0.1, routeCoverage: null, ...(config.targets || {}) };
	config.attemptBudget = config.attemptBudget ?? 3;
	config.marker = config.marker || 'uxqa';
	// null is meaningful (Playwright's bundled Chromium), so only a missing key falls back to Chrome.
	if (!('browserChannel' in config)) config.browserChannel = 'chrome';
	return config;
}

export function loadStudy(start) {
	const studyDir = findStudyDir(start);
	const repoRoot = path.dirname(studyDir);
	const config = withDefaults(parseStudyConfig(fs.readFileSync(path.join(studyDir, 'study.md'), 'utf8')));
	for (const [name, apply] of Object.entries(ENV_OVERRIDES)) if (process.env[name]) apply(config, process.env[name]);
	if (!config.baseUrl) throw new Error('study config has no baseUrl');
	config.baseUrl = config.baseUrl.replace(/\/+$/, '');
	const resolve = (p) => (p == null ? p : path.isAbsolute(p) ? p : path.join(repoRoot, p));
	/** Pass ids are "<NN>-<scenario-slug>"; a bare number is matched against existing pass directories. */
	const passDir = (id) => {
		const passes = path.join(studyDir, 'passes');
		if (/^\d+$/.test(String(id)) && fs.existsSync(passes)) {
			const hit = fs.readdirSync(passes).find((d) => d.split('-')[0] === String(id).padStart(2, '0'));
			if (hit) return path.join(passes, hit);
		}
		return path.join(passes, String(id));
	};
	return { studyDir, repoRoot, config, resolve, passDir };
}

/** Import Playwright from the target repo (config.playwright may be a path, a file URL, or a package name). */
export async function importPlaywright(study) {
	const spec = study.config.playwright || 'playwright';
	if (/^file:/.test(spec)) return import(spec);
	if (path.isAbsolute(spec) || spec.startsWith('.')) return import(pathToFileURL(study.resolve(spec)).href);
	try {
		const requireFromRepo = createRequire(path.join(study.repoRoot, 'package.json'));
		return import(pathToFileURL(requireFromRepo.resolve(spec)).href);
	} catch {
		return import(spec);
	}
}

/** All pass directory names, oldest first (the NN prefix orders them). */
export function listPasses(study) {
	const passes = path.join(study.studyDir, 'passes');
	if (!fs.existsSync(passes)) return [];
	return fs.readdirSync(passes, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d+-/.test(d.name)).map((d) => d.name).sort();
}
