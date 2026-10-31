// Seeds personas.json (qa-* organisations, groups, users) and mints a signed session cookie per persona. Runs INSIDE the test container.
// Input /app/qa-personas.json: { seed: { orgs: [{handle,name,visibility}], groups: [{handle,name,org,visibility}] }, personas: [{handle,name,seed:{platformRole,org,orgRole,groups:[{handle,role}],bio}}] }
// The Prisma model names and the token format below are the source app's; replace them with your app's.
import './qa-in-target-guard.mjs'; // adapter.sh pushes every file as /app/qa-<name>, hence the qa- prefix
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import fs from 'node:fs';

const prisma = new PrismaClient();
const spec = JSON.parse(fs.readFileSync('/app/qa-personas.json', 'utf8'));
const fixtures = spec.seed || {};
/** Refuse any handle outside the persona namespace: the adapter can never write a real user's row. */
const qa = (handle) => { if (!/^qa-[a-z0-9-]+$/.test(handle || '')) throw new Error(`non-qa handle refused: ${handle}`); return handle; };
const base64url = (text) => Buffer.from(text, 'utf8').toString('base64url');

/** Replica of the app's token format (HS256 JWT signed with the in-container secret); the secret never leaves the container. */
function cookieFor(session) {
	const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'HS256' }));
	const body = base64url(JSON.stringify({ iss: 'api', aud: 'api', sub: session.userId, exp: Math.floor((Date.now() + 12 * 3600e3) / 1000), session_id: session.id, session_exp: Math.floor(session.expiresAt.getTime() / 1000), platform_role: session.platformRole }));
	const signature = crypto.createHmac('sha256', Buffer.from(process.env.AUTH_SECRET, 'utf8')).update(`${header}.${body}`).digest('base64url');
	return `${header}.${body}.${signature}`;
}

const orgs = {}, groups = {};
for (const o of fixtures.orgs || []) {
	orgs[o.handle] = (await prisma.organization.findUnique({ where: { handle: qa(o.handle) }, select: { id: true } }))
		?? await prisma.organization.create({ data: { handle: o.handle, name: o.name, description: `UX QA fixture (${o.handle}).`, visibility: o.visibility ?? 'PUBLIC' }, select: { id: true } });
}
for (const g of fixtures.groups || []) {
	groups[g.handle] = (await prisma.group.findUnique({ where: { handle: qa(g.handle) }, select: { id: true } }))
		?? await prisma.group.create({ data: { handle: g.handle, name: g.name, description: `UX QA fixture (${g.handle}).`, visibility: g.visibility ?? 'PUBLIC', organizationId: orgs[g.org].id }, select: { id: true } });
}

const out = [];
for (const persona of spec.personas) {
	const seed = persona.seed || {};
	const data = { name: persona.name, platformRole: seed.platformRole ?? 'USER', emailVerified: new Date(), isActive: true, policyAgreement: true, bio: seed.bio ?? undefined };
	let user = await prisma.user.findUnique({ where: { handle: qa(persona.handle) }, select: { id: true } });
	user = user ? await prisma.user.update({ where: { id: user.id }, data, select: { id: true } })
		: await prisma.user.create({ data: { id: crypto.randomUUID(), handle: persona.handle, email: `${persona.handle}@example.com`, ...data }, select: { id: true } });
	// Memberships are reset to exactly what the file declares, so re-seeding is idempotent.
	await prisma.orgMembership.deleteMany({ where: { userId: user.id } });
	if (seed.org) await prisma.orgMembership.create({ data: { orgId: orgs[seed.org].id, userId: user.id, role: seed.orgRole ?? 'MEMBER' } });
	for (const g of seed.groups || []) {
		await prisma.usersToGroups.upsert({ where: { userId_groupId: { userId: user.id, groupId: groups[g.handle].id } }, create: { userId: user.id, groupId: groups[g.handle].id, role: g.role ?? 'USER' }, update: { role: g.role ?? 'USER' } });
	}
	await prisma.session.deleteMany({ where: { userId: user.id } });
	const session = await prisma.session.create({ data: { userId: user.id, platformRole: data.platformRole, expiresAt: new Date(Date.now() + 30 * 864e5) } });
	out.push({ handle: persona.handle, cookie: cookieFor({ ...session, userId: user.id }) });
}
console.log('SESSIONS ' + JSON.stringify(out));
await prisma.$disconnect();
