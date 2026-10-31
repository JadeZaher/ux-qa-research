---
type: Plugin Overview
title: ux-qa-research
description: Reproducible agent-swarm UX QA + research method for any web app, run as a conductor-style study.
---

# ux-qa-research 0.1.0

Turns "let a swarm of agents poke the app" into a study you can repeat,
compare across passes and defend: guarded test environment, persona cast with
constrained segments, ui-only Playwright lanes with friction capture and a
trace per journey, route/API coverage, gold tasks with trends, a seven-lens
UX research panel, triage confirmed against code, fix lanes, adversarial
review, and a verdict the coordinator signs only after re-running every claim.

Generalised from a harness that ran against a live test tenant of a
production multi-tenant app; the lessons it encodes are listed in
`skills/ux-qa-research/SKILL.md`.

## Install

```
/plugin install ux-qa-research --marketplace JadeZaher/ux-qa-research
```

## Quick start

```
/ux-qa-research:setup https://my-app-test.example.com     # writes uxqa/, proves guard, smoke-tests adapter + ux-lib
/ux-qa-research:pass onboarding "A partner org onboards 20 members in a week"
/ux-qa-research:loop 3 onboarding:"..." moderation:"..." mobile-first:"..."
/ux-qa-research:report --dialectic
/ux-qa-research:status
```

Install check without any network: `node lib/self-test.mjs <path to playwright/index.mjs>`
(spins up a localhost app, runs instrumented sessions and a gold task, builds a
report and asserts on it) and `node --test lib/test/*.test.mjs`.

## Layout

| Path | What |
|---|---|
| `skills/ux-qa-research/SKILL.md` | The method: bundle layout, phases with gates, exit criteria, model tiering, coordinator duties |
| `commands/` | `setup`, `pass`, `loop`, `report`, `status` |
| `workflows/pass.generic.js` | One pass as a Workflow script: Guard -> Personas -> Seed -> Prebake -> Swarm -> Metrics -> Panel -> Synthesis -> Triage -> Fix -> Review -> Verdict |
| `workflows/dialectic.generic.js` | Product assessment: assess x3 -> thesis / antithesis -> synthesis -> attack -> revise -> write |
| `lib/` | `ux-lib` (capture), `friction` (metrics), `route-inventory` (coverage), `ux-report` (aggregation), `gold-tasks`, `guard`, `study-config`; rationale in `lib/AGENTS.md` |
| `reference/` | Definitions and rationale: friction metrics, research panel, personas, safety, session adapters |
| `templates/` | `study.md`, `RUNBOOK.md`, pass `scenario.md` / `verdict.md`, `gitignore`, example personas, two adapters |
| `vendor/` | axe-core 4.10.2 (`axe.min.js`, MPL-2.0 - see `vendor/axe-core.LICENSE` and `vendor/README.txt` for the sha256) |

## Generic vs project-specific

Generic (ships in the plugin): the method, both workflows, all of `lib/`,
metrics and score, coverage for SvelteKit / Next app / Next pages, gold-task
harness, research lenses and rubric, safety rules, templates, axe-core.

Project-specific (lives in the target repo's `uxqa/`):
- `study.md` config block: base URL, **guard** (endpoint, field, value,
  deny-listed hosts), cookie name/domain, routes dir, API style, Playwright
  path, gold tasks, targets, verification commands, hooks.
- The **session adapter** (`uxqa/adapter/`): how this product seeds accounts
  and mints sessions. Two worked examples in `templates/adapters/`.
- `extraRules`: product-specific forbidden actions (e.g. no mentions that
  trigger async AI replies in another environment).
- Push/deploy/wait hooks between passes.

## Accessibility scanning

`axe()` in a session injects the plugin's vendored axe-core (`vendor/axe.min.js`,
4.10.2, MPL-2.0) and runs the `wcag2a`, `wcag2aa` and `wcag21aa` rule sets.
Results feed the `axeViolations` metric, the per-route heatmap and
`axeRules` in the report (reference/friction-metrics.md). A study can pin a
different build with `"axePath"` in its config. The MPL-2.0 licence covers the
axe-core file only; keep `vendor/axe-core.LICENSE` next to it when
redistributing.

## Requirements

Node 20+ (tested on 24), Playwright in the target repo (`playwright` or
`@playwright/test`), a Chrome channel or Playwright's bundled Chromium
(`browserChannel: null`). Windows Git Bash: prefix flow runs with
`MSYS_NO_PATHCONV=1`.

## Hard rules (reference/safety.md)

Agents never change environments, variables or deployments; every write is
behind the identity guard; secrets travel by stdin/env and are never printed;
traces are never published; everything created is marker-tagged; real users
are never touched; test claims are re-run by the coordinator.
