// Route inventory across the three supported routers: real file trees in a temp dir, table-driven URL -> route id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routeInventory, detectFramework } from '../route-inventory.mjs';

function tree(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uxqa-routes-'));
	for (const f of files) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), ''); }
	return root;
}

const CASES = {
	sveltekit: {
		files: ['+page.svelte', '(app)/research/+page.svelte', '(app)/research/new/+page.svelte', '(app)/research/[id]/+page.svelte', '(app)/research/[id]/v/[number]/+page.svelte', '@[userHandle]/edit/+page.svelte', 'docs/[...rest]/+page.svelte', '[[lang]]/about/+page.svelte', 'api/health/+server.ts'],
		pages: 8, apis: 1,
		urls: [['/', '/'], ['/research', '/research'], ['/research/new', '/research/new'], ['/research/abc', '/research/[id]'], ['/research/abc/v/2', '/research/[id]/v/[number]'], ['/@jo/edit', '/@[userHandle]/edit'], ['/docs', '/docs/[...rest]'], ['/docs/a/b', '/docs/[...rest]'], ['/fr/about', '/[[lang]]/about'], ['/about', '/[[lang]]/about'], ['/nope/x', 'UNMATCHED:/nope/x']],
	},
	'next-app': {
		files: ['app/page.tsx', 'app/(marketing)/pricing/page.tsx', 'app/blog/[slug]/page.tsx', 'app/shop/[...slug]/page.tsx', 'app/docs/[[...slug]]/page.mdx', 'app/@modal/(.)photo/[id]/page.tsx', 'app/photo/[id]/page.tsx', 'app/_lib/page.tsx', 'app/dash/@team/settings/page.tsx', 'app/api/users/[id]/route.ts'],
		dir: 'app', pages: 7, apis: 1,
		urls: [['/', '/'], ['/pricing', '/pricing'], ['/blog/hello', '/blog/[slug]'], ['/shop', 'UNMATCHED:/shop'], ['/shop/a/b', '/shop/[...slug]'], ['/docs', '/docs/[[...slug]]'], ['/photo/1', '/photo/[id]'], ['/dash/settings', '/dash/settings']],
		api: [['/api/users/9', '/api/users/[id]']],
	},
	'next-pages': {
		files: ['pages/index.tsx', 'pages/_app.tsx', 'pages/about.tsx', 'pages/posts/[id].tsx', 'pages/posts/index.tsx', 'pages/api/hello.ts'],
		dir: 'pages', pages: 4, apis: 1,
		urls: [['/', '/'], ['/about', '/about'], ['/posts', '/posts'], ['/posts/7', '/posts/[id]']],
		api: [['/api/hello', '/api/hello']],
	},
};

for (const [framework, c] of Object.entries(CASES)) {
	test(`${framework}: detects the router, counts routes and maps URLs`, (t) => {
		const root = tree(c.files);
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const dir = path.join(root, c.dir || '');
		assert.equal(detectFramework(dir), framework);
		const inventory = routeInventory({ dir });
		assert.equal(inventory.pages.length, c.pages);
		assert.equal(inventory.apis.length, c.apis);
		for (const [url, id] of c.urls) assert.equal(inventory.pageOf(url), id, url);
		for (const [url, id] of c.api || []) assert.equal(inventory.apiOf(url), id, url);
	});
}

test('ignorePrefix strips a locale prefix before matching', (t) => {
	const root = tree(['+page.svelte', 'learning/+page.svelte']);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const inventory = routeInventory({ dir: root, ignorePrefix: '^/(fr|es)(?=/|$)' });
	assert.equal(inventory.pageOf('/fr/learning'), '/learning');
	assert.equal(inventory.pageOf('/es'), '/');
});
