// Route + API inventory from a file-system router: SvelteKit, Next.js app router, Next.js pages router.
// routeInventory({ dir, framework, ignorePrefix }) -> { framework, pages, apis, pageOf(path), apiOf(path) }
// CLI: node route-inventory.mjs [routesDir] [framework]   see lib/AGENTS.md sec. route-inventory
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = /\.(js|jsx|ts|tsx|mjs|mdx)$/;
const FRAMEWORKS = {
	sveltekit: { page: (f) => f === '+page.svelte', api: (f) => /^\+server\.(js|ts)$/.test(f), fileSegment: false },
	'next-app': { page: (f) => /^page\.(js|jsx|ts|tsx|mdx)$/.test(f), api: (f) => /^route\.(js|ts)$/.test(f), fileSegment: false },
	'next-pages': { page: (f) => SCRIPT.test(f) && !f.startsWith('_'), api: (f) => SCRIPT.test(f) && !f.startsWith('_'), fileSegment: true },
};

function walk(dir, visit, rel = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		if (entry.isDirectory()) walk(path.join(dir, entry.name), visit, [...rel, entry.name]);
		else visit(rel, entry.name);
	}
}

/** Pick the router by the files present: +page.svelte -> sveltekit, page.* -> next-app, otherwise next-pages. */
export function detectFramework(dir) {
	let found = null;
	walk(dir, (_rel, name) => {
		if (found) return;
		if (name === '+page.svelte') found = 'sveltekit';
		else if (/^page\.(js|jsx|ts|tsx|mdx)$/.test(name)) found = 'next-app';
	});
	return found || 'next-pages';
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PARAM = /\[\[\.\.\.[^\]]+\]\]|\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\]|\[[^\]]+\]/g;

/** One path segment -> regex source (leading slash included); dynamic parts become wildcards, literals are escaped. */
function segmentPattern(segment, framework) {
	if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return '(?:/.*)?';
	// SvelteKit rest params may be empty; a Next.js [...slug] needs at least one segment.
	if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return framework === 'sveltekit' ? '(?:/.*)?' : '/.+';
	if (/^\[\[[^\]]+\]\]$/.test(segment)) return '(?:/[^/]+)?';
	let source = '', last = 0;
	for (const match of segment.matchAll(PARAM)) {
		source += escapeRegex(segment.slice(last, match.index)) + '[^/]+';
		last = match.index + match[0].length;
	}
	return '/' + source + escapeRegex(segment.slice(last));
}

/** Next intercepting routes ((.)x, (..)x, (...)x) render another route's URL; they are not routes of their own. */
const isIntercepting = (segment) => segment.startsWith('(.');
/** Directory segments that do not appear in the URL: (group) layouts, and @slot parallel routes in the Next app router only (SvelteKit's @ is literal, e.g. /@[handle]). */
const isInvisible = (segment, framework) => (/^\(.*\)$/.test(segment) && !isIntercepting(segment)) || (framework === 'next-app' && segment.startsWith('@'));
/** Next private folders (_name) are excluded from routing; SvelteKit has no such rule. */
const isPrivate = (segment, framework) => framework !== 'sveltekit' && segment.startsWith('_');

function toRoute(segments, framework) {
	const visible = segments.filter((s) => !isInvisible(s, framework));
	const id = '/' + visible.join('/');
	return {
		id,
		rx: new RegExp('^' + visible.map((s) => segmentPattern(s, framework)).join('') + '/?$'),
		specificity: visible.filter((s) => !s.includes('[')).length,
		dynamic: visible.filter((s) => s.includes('[')).length,
	};
}

/** Most static segments first, then fewest dynamic ones: /a/new must win over /a/[id]. */
const bySpecificity = (a, b) => b.specificity - a.specificity || a.dynamic - b.dynamic || b.id.length - a.id.length;

export function routeInventory({ dir, framework = 'auto', ignorePrefix = null } = {}) {
	if (!dir || !fs.existsSync(dir)) throw new Error('routes dir not found: ' + dir);
	const kind = framework === 'auto' ? detectFramework(dir) : framework;
	const rules = FRAMEWORKS[kind];
	if (!rules) throw new Error('unsupported framework: ' + kind + ' (sveltekit | next-app | next-pages)');
	const pages = [], apis = [];
	walk(dir, (rel, name) => {
		if (rel.some(isIntercepting) || rel.some((s) => isPrivate(s, kind))) return;
		if (rules.fileSegment) {
			// Pages router: the file name is the last segment, index maps to its folder, pages/api/** are endpoints.
			const base = name.replace(SCRIPT, '');
			const segments = base === 'index' ? rel : [...rel, base];
			if (rel[0] === 'api') { if (rules.api(name)) apis.push(toRoute(segments, kind)); }
			else if (rules.page(name)) pages.push(toRoute(segments, kind));
			return;
		}
		if (rules.page(name)) pages.push(toRoute(rel, kind));
		else if (rules.api(name)) apis.push(toRoute(rel, kind));
	});
	pages.sort(bySpecificity); apis.sort(bySpecificity);
	const strip = ignorePrefix ? new RegExp(ignorePrefix) : null;
	const normalise = (p) => { const clean = String(p || '/').split(/[?#]/)[0]; return (strip ? clean.replace(strip, '') : clean) || '/'; };
	const match = (table, p) => (table.find((r) => r.rx.test(normalise(p))) || { id: 'UNMATCHED:' + normalise(p) }).id;
	return { framework: kind, pages, apis, pageOf: (p) => match(pages, p), apiOf: (p) => match(apis, p) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const inventory = routeInventory({ dir: path.resolve(process.argv[2] || 'src/routes'), framework: process.argv[3] || 'auto' });
	console.log(JSON.stringify({ framework: inventory.framework, pageCount: inventory.pages.length, apiCount: inventory.apis.length, pages: inventory.pages.map((r) => r.id), apis: inventory.apis.map((r) => r.id) }, null, 1));
}
