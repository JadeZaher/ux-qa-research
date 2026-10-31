// In-container guard: refuse unless THIS process runs in the test deployment (second guard, different failure mode from the URL check).
// Adapt the two expectations to whatever only your test environment has.
const EXPECTED_ENVIRONMENT = 'test-tenant';
const EXPECTED_DEPLOYMENT_KEY = 'test-tenant';
const deploymentKey = (() => { try { return JSON.parse(process.env.PLATFORM_CONFIG_JSON || '{}').deploymentKey; } catch { return null; } })();
if (process.env.ENVIRONMENT !== EXPECTED_ENVIRONMENT || deploymentKey !== EXPECTED_DEPLOYMENT_KEY) {
	console.error(`REFUSED: ENVIRONMENT=${process.env.ENVIRONMENT} deploymentKey=${deploymentKey}`);
	process.exit(2);
}
