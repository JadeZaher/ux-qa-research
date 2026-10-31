// One-hour magic sign-in link for a qa-* persona, so a human can look at the app as that persona. Runs INSIDE the test container.
// Row shape assumes a verificationToken table (email, token, expires); replace with your app's passwordless-link mechanism.
import './qa-in-target-guard.mjs'; // adapter.sh pushes every file as /app/qa-<name>, hence the qa- prefix
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const handle = process.argv[2];
if (!/^qa-[a-z0-9-]+$/.test(handle || '')) { console.error('usage: link.mjs qa-<persona>'); process.exit(4); }
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { handle }, select: { email: true } });
if (!user) { console.error(`no persona ${handle}`); process.exit(5); }
const token = crypto.randomBytes(32).toString('hex');
await prisma.verificationToken.create({ data: { email: user.email, token, expires: new Date(Date.now() + 60 * 60 * 1000) } });
console.log(`LINK ${process.env.ORIGIN}/login/${token}`);
await prisma.$disconnect();
