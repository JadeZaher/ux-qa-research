---
type: UX Study
title: "{{product}} UX QA + research study"
description: Target, guard, adapter, routes, gold tasks and safety rules for agent-swarm UX passes.
timestamp: "{{date}}"
---

# {{product}} - UX study

## Product

{{one paragraph: what the product is, who uses it, the jobs they hire it for}}

## Target environment

- **Base URL:** {{baseUrl}} (test environment ONLY)
- **Guard:** `GET {{guard.path}}` -> `{{guard.field}}` must equal `{{guard.equals}}`. Deny-listed hosts: {{forbidHosts}}.
- **Mail:** {{sink | how notifications are neutralised}}
- **Who owns it / how it is reset:** {{owner, reset procedure}}

## Session adapter

- Seed: `{{adapter.seed}}`
- Link: `{{adapter.link}}`
- Handle rule: `^qa-[a-z0-9-]+$`
- Sessions file: `uxqa/.secrets/sessions.json` (gitignored; never printed)

## Routes and API

- Routes dir: `{{routes.dir}}` ({{routes.framework}})
- API style: {{rest | trpc}}; procedures inventory: {{api.proceduresFile or none}}

## Gold tasks

| id | persona | goal (user words) | success |
|---|---|---|---|
| {{gold-...}} | {{qa-...}} | {{...}} | {{urlMatches / textVisible}} |

## Safety rules (in addition to the plugin's reference/safety.md)

- {{project-specific forbidden actions, e.g. no @mentions that trigger async AI replies}}

## Verification commands (re-run by the coordinator, never trusted from agents)

- Tests: `{{testCommand}}`
- Typecheck: `{{typecheckCommand}}`
- Build: `{{buildCommand}}`
- Known-red baseline: {{baseRedFile or none}}

## Machine config

The block below is what the scripts read. Keep it in sync with the prose above;
it wins when they disagree.

```json uxqa-config
{
 "product": "{{product}}",
 "baseUrl": "{{baseUrl}}",
 "guard": { "path": "{{guard.path}}", "field": "{{guard.field}}", "equals": "{{guard.equals}}", "forbidHosts": [] },
 "session": { "cookieName": "session", "cookieDomain": null, "sessionsFile": "uxqa/.secrets/sessions.json" },
 "adapter": { "seed": "{{adapter seed command with {personas} and {out}}}", "link": "{{adapter link command}}", "guard": "{{adapter guard command}}" },
 "routes": { "dir": "src/routes", "framework": "auto", "ignorePrefix": null },
 "api": { "style": "rest", "prefixes": ["/api/"], "trpcPrefix": "/api/", "proceduresFile": null },
 "playwright": "playwright",
 "browserChannel": "chrome",
 "axePath": null,
 "marker": "uxqa",
 "attemptBudget": 3,
 "lenses": [],
 "goldTasks": [
  { "id": "gold-example", "persona": "qa-newcomer", "start": "/", "goal": "{{user words}}", "success": { "textVisible": "{{...}}" }, "maxSeconds": 300 }
 ],
 "targets": { "goldSuccess": 0.8, "newHigh": 0, "frictionTolerance": 0.1, "routeCoverage": null },
 "fixRepo": null,
 "testCommand": "{{...}}",
 "typecheckCommand": "{{...}}",
 "buildCommand": "{{...}}",
 "baseRedFile": null,
 "hooks": { "afterFix": null, "waitDeploy": null, "beforePass": null },
 "extraRules": []
}
```
