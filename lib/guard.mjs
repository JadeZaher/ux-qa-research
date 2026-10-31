// Identity-endpoint guard: refuse to act unless the target proves it IS the study's test environment.
// assertTestTarget(study) -> { ok, identity } or throws REFUSED.   CLI: node guard.mjs  (exit 0 OK, 2 REFUSED)
// Why two checks (field match AND host deny-list): reference/safety.md sec. Guards
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadStudy } from './study-config.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const verified = new Map();

/** Read a dotted field ("platform.deploymentKey") out of a JSON body. */
const pick = (body, field) => field.split('.').reduce((value, key) => (value == null ? value : value[key]), body);

export async function assertTestTarget(study) {
	const { baseUrl, guard } = study.config;
	if (verified.has(baseUrl)) return verified.get(baseUrl);
	const host = new URL(baseUrl).hostname;
	if ((guard?.forbidHosts || []).some((h) => host === h || host.endsWith('.' + h))) throw new Error(`REFUSED: ${host} is on the guard deny-list`);
	let result;
	if (!guard?.path) {
		// No identity endpoint: only a local target is acceptable without proof.
		if (!LOCAL_HOSTS.has(host)) throw new Error(`REFUSED: no guard configured and ${host} is not local`);
		result = { ok: true, identity: 'local:' + host };
	} else {
		let body;
		try {
			const response = await fetch(baseUrl + guard.path, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
			body = await response.json();
		} catch (error) {
			throw new Error(`REFUSED: guard ${guard.path} unreadable (${String(error.message || error).slice(0, 80)})`);
		}
		const value = pick(body, guard.field);
		if (value !== guard.equals) throw new Error(`REFUSED: ${baseUrl}${guard.path} reports ${guard.field}=${JSON.stringify(value)}, expected ${JSON.stringify(guard.equals)}`);
		result = { ok: true, identity: `${guard.field}=${value}` };
	}
	verified.set(baseUrl, result);
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		const study = loadStudy();
		const { identity } = await assertTestTarget(study);
		console.log(`OK ${study.config.baseUrl} ${identity}`);
	} catch (error) {
		console.log(String(error.message || error).split('\n')[0]);
		process.exit(2);
	}
}
