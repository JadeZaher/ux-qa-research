---
description: Run one UX QA + research pass (personas -> swarm -> metrics -> research panel -> triage -> fix -> review -> verdict) via the Workflow tool
argument-hint: <scenario-slug> "<scenario brief>" [--research-only] [--lanes N] [--cast N]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Workflow
model: inherit
---

# One pass

`PLUGIN` = `${CLAUDE_PLUGIN_ROOT}` (else the `installPath` of
`ux-qa-research@local` in `~/.claude/plugins/installed_plugins.json`).

## 1 Pre-flight (coordinator)

1. Read `uxqa/study.md` (config block) and the top of `uxqa/RUNBOOK.md`. No
   study -> "Run `/ux-qa-research:setup` first."
2. `node PLUGIN/lib/guard.mjs` must print `OK`. Anything else: stop, record it
   in the RUNBOOK, do not start the workflow.
3. Pass id: next `NN` after the highest `uxqa/passes/NN-*` (00-setup does not
   count as a pass), slug from the argument -> `PASS = NN-slug`.
4. Previous pass = highest earlier pass with a `verdict.md`; load its
   `ledger.json` entries as `priorLedger`.
5. Write `uxqa/passes/<PASS>/scenario.md` from `PLUGIN/templates/pass/scenario.md`
   (brief from the argument, focus areas, carried research questions).
6. Note the deployed commit if the project exposes it (e.g. a version
   endpoint); otherwise leave it out.
7. Cost check: lanes x tier. Over ~10 lanes or ~4 opus fix lanes, say the
   expected cost before launching.

## 2 Launch

`Workflow({ scriptPath: "PLUGIN/workflows/pass.generic.js", args })` with:

```json
{
 "pass": "<PASS>", "passNumber": <NN>, "pluginRoot": "<PLUGIN, forward slashes>",
 "scenario": { "slug": "<slug>", "name": "<name>", "brief": "<brief>" },
 "priorPass": "<previous PASS or null>", "priorLedger": [ ... ],
 "deployedHash": "<hash or null>",
 "castSize": 16, "laneCount": 6, "probeLanes": 1, "maxFixLanes": 3,
 "fix": true, "seededFixes": [],
 "study": {
  "product": "...", "repoRoot": "<repo, forward slashes>", "studyDir": "<repo>/uxqa",
  "baseUrl": "...", "guardDescription": "GET <path> -> <field> == <value>",
  "adapterSeed": "<adapter.seed with {personas} and {out}>", "sessionsFile": "<session.sessionsFile>",
  "goldTasks": <output of: node PLUGIN/lib/gold-tasks.mjs list>,
  "marker": "...", "lenses": [], "extraRules": [],
  "fixRepo": null, "testCommand": "...", "typecheckCommand": "...", "buildCommand": "...", "baseRedFile": null
 }
}
```

`--research-only` -> `"fix": false` (stops after triage). The script is pure
ASCII with LF endings; if you ever edit it, keep it that way (the permission
hook rejects non-ASCII and CR) and parse-check it by wrapping the body after
`meta` in an async function and running `node --check`.

While it runs: never SendMessage a workflow agent (it forks a duplicate
writer). If it dies, relaunch with the same `scriptPath` and `resumeFromRunId`.

## 3 Close the pass (coordinator, never delegated)

1. Read `verdict.md` sec. 2 "Claims to re-run". Run **every** command
   yourself from the stated directory; paste the result lines into the
   verdict. Compare reds against the known-red baseline.
2. Fill the "Coordinator re-run" row; set frontmatter `status` to
   `APPROVED` (all exit checks pass and re-run green), `CHANGES_REQUESTED`,
   or `RESEARCH_ONLY`.
3. Update `ledger.json` statuses for fixes confirmed by your re-run (`FIXED`),
   then re-run `node PLUGIN/lib/ux-report.mjs <PASS>` so `exitChecks.newHigh`
   reflects them.
4. Prepend the pass block to `uxqa/RUNBOOK.md` (template in
   `PLUGIN/templates/RUNBOOK.md`).
5. Report to the user: exit-check table, top 5 friction routes, top 5
   synthesis findings with severity, ledger counts, commits (local, unpushed),
   persona refinement, suggested next scenario. Push/deploy is the user's or
   the project's own step.
