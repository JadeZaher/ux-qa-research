---
name: ux-qa-research
description: >
  Reproducible agent-swarm UX QA + research for any web app, run as a
  conductor-style study: a guarded test environment, a persona cast with
  constrained segments, ui-only Playwright lanes that capture friction (dead and
  rage clicks, workarounds, abandonment) with a trace per journey, route/API
  coverage, gold tasks with cross-pass trends, a multi-lens research panel,
  triage confirmed against code, fix lanes, adversarial review and a recorded
  verdict. Use for "UX QA", "persona swarm", "usability pass", "friction
  report", "UX research panel", "gold tasks", "ux study", or a thorough
  product review of a web app.
---

# ux-qa-research - the method

A **study** is an OKF bundle in the target repo at `uxqa/` (YAML frontmatter
with `type` on every markdown file, as in conductor-okf's
`reference/okf-format.md`). A study is run as a sequence of **passes**; each
pass is one scenario, one cast, one swarm, one verdict.

```
uxqa/
  study.md                  type: UX Study        - product, target, guard, adapter, routes, gold tasks, safety, ```json uxqa-config```
  RUNBOOK.md                type: UX Study Runbook - rolling state, newest first, one block + verdict per pass
  .gitignore                .secrets/, passes/*/runs/, passes/*/flows/
  .secrets/sessions.json    adapter output (never printed, never committed)
  adapter/                  the project's session adapter (only project-specific code)
  passes/<NN>-<scenario-slug>/
    scenario.md             type: UX Pass Scenario
    personas.json           cast + lanes (+ shared seed fixtures)
    prebake.json            manifest of fixtures created through the real API
    runs/<persona>--<task>/ ux.json, trace.zip, *.png      (gitignored)
    flows/<lane>/*.mjs      lane scripts                   (gitignored)
    ux-report.json          coverage, heatmap, scorecards, axe rules, gold trend, exit checks
    synthesis.md            type: UX Synthesis - research panel output
    ledger.json             triaged defects and research questions
    verdict.md              type: Pass Verdict - exit checks, re-run claims, persona refinement
```

Commands: `/ux-qa-research:setup`, `:pass`, `:loop`, `:report`, `:status`.
Rationale and definitions live in `reference/`; this file is the procedure.

## Lessons this method is built on

| Failure seen in real runs | Built-in answer |
|---|---|
| Agents are not users: they read source and fall back to the API | UX lanes are **ui-only**; `request()`/`trpc()` there are logged as workarounds; any source-derived shortcut must call `workaround(why)`. Capability checks run in separate **probe** lanes that do not count as UX. |
| Infinite patience | `attempt(name, fn)` with a per-persona budget; exhaustion records **abandonment**. Gold tasks have a time limit. |
| "Looks good" with no numbers | Friction metrics per run, per route and per pass; gold tasks with success rates and trends across passes (reference/friction-metrics.md). |
| Cosmetic diversity | At least a third of the cast is constrained: keyboard-only, accessibility-tree-only, 200% zoom, slow network, locales, low literacy acting only on visible text, 390 px; mixed model tiers (reference/personas.md). |
| Coverage unmeasured | Route + API inventory from the file router (SvelteKit, Next app, Next pages) against observed navigations and requests. |
| No reproducibility | `trace.zip` per journey; flows saved per lane. |
| Environment drift | HARD RULE: agents never change environments, variables or deployments. Identity-endpoint guard before any write; a second guard inside the adapter (reference/safety.md). |
| Hypotheses shipped as facts | Panel findings are hypotheses; triage fixes only what is confirmed in code and backed by evidence; the rest become research questions with a 5-sessions-per-segment validation plan. |
| Rubber-stamp reviews and phantom green tests | Reviews are prompted to refute; the verdict stays `PENDING_COORDINATOR_RERUN` until the coordinator re-runs every test/typecheck/build claim. |
| Secrets in transcripts | Secrets via stdin/env only; adapters print status lines only; sessions files are counted, never printed; traces never published. |

## Phases and gates

Every phase ends with a recorded gate. A failed gate stops the pass and is
written to `RUNBOOK.md`; nothing downstream runs on an unproven input.

| # | Phase | Who (model) | Output | Gate |
|---|---|---|---|---|
| 0 | **Setup** (once per study) | coordinator | `study.md`, `RUNBOOK.md`, adapter, `.gitignore` | `node lib/guard.mjs` prints `OK`; adapter `guard` prints `OK`; adapter seeds one smoke persona; one ux-lib smoke run produces `ux.json` + `trace.zip`; `ux-report` maps it to a route |
| 1 | **Scenario** | coordinator | `scenario.md` | brief names the situation and the feature areas; prior research questions carried over |
| 2 | **Personas** | designer/refiner (opus) | `personas.json` | >= 1/3 constrained, mixed tiers, every lane has a journey, gold lane covers every gold task, >= 1 probe lane |
| 3 | **Seed** | sonnet | sessions file | entry count == persona count (verified by count only) |
| 4 | **Prebake** | opus | `prebake.json` | every fixture created through the real API, marker-tagged; refusals logged as defects |
| 5 | **Swarm** | lanes (persona tier) | `runs/**`, lane reports | every journey called `finish()`; failed lanes reported, not retried silently |
| 6 | **Metrics** | haiku | `ux-report.json` | report written; `unmatchedPaths` reviewed (non-empty usually means a wrong routes dir) |
| 7 | **Research panel** | 7 lenses (sonnet) | lens findings | every finding cites evidence paths and a validation method |
| 8 | **Synthesis** | opus | `synthesis.md` | affinity map, heatmap narrative, Nielsen violations, JTBD gaps, severity-ranked findings, human validation plan |
| 9 | **Triage** | architect (opus) | `ledger.json`, fix lanes | each FIX has a `file:line` root cause; fix lanes own disjoint files |
| 10 | **Fix** | executor-high (opus) + integrator (sonnet) | local commits | each fix has a test that fails on revert; no push |
| 11 | **Adversarial review** | code-reviewer (opus) | verdict | APPROVE only what was checked; medium+ findings fixed in one more commit |
| 12 | **Verdict** | sonnet draft, coordinator final | `verdict.md`, RUNBOOK block | coordinator re-ran every claimed command and pasted result lines; status set |
| 13 | **Persona refinement** | (feeds next pass's phase 2) | `verdict.md` sec. 4 | keep / retire / add / re-power listed with reasons |

Phases 2-12 run as one Workflow (`workflows/pass.generic.js`); the
coordinator owns phases 0, 1 and the final step of 12. A research-only pass
(`fix: false`) stops after triage.

## Exit criteria (per pass; the study is "done" when two consecutive passes meet them)

- Gold-task success >= `targets.goldSuccess` (default 0.8) on **every** gold task.
- 0 new BLOCKER/HIGH left open (`targets.newHigh`).
- Friction per journey not up more than `targets.frictionTolerance` (10%) on the previous pass, and down over the last three.
- Route coverage >= `targets.routeCoverage` when set.
- Adversarial review APPROVE, and the coordinator's re-run green against the known-red baseline.
- Every open RESEARCH_QUESTION is in a human validation plan (5 sessions per segment).

## Model tiering

| Role | Tier | Why |
|---|---|---|
| Guard, metrics, seed checks | haiku | mechanical, exact commands |
| Low-literacy / impatient personas | haiku | under-reading is the point |
| Most UX lanes, probe lanes, lenses, integrator, verdict draft | sonnet | standard judgement |
| Persona design, prebake, synthesis, triage, fixes, review | opus | design, code confirmation, refutation |
| Expert personas (at most two) | opus | expert-path issues |

Never `fable` for a fan-out. Mention the cost before launching a pass with
more than ~10 lanes.

## Coordinator duties (never delegated)

1. Prove the guard before every pass (`node lib/guard.mjs`).
2. Never message a running Workflow agent (it forks a duplicate writer);
   resume with `resumeFromRunId`.
3. Re-run every test/typecheck/build command listed in `verdict.md` sec. 2
   yourself; paste result lines; then set the verdict status.
4. Push/deploy between passes through the project's own step (never an agent).
5. Roll `RUNBOOK.md` with the pass block.

## Writing lane flows (what lane agents are told)

```js
import { uxSession, BASE } from 'file:///<plugin>/lib/ux-lib.mjs';
const s = await uxSession({ handle: 'qa-member-jules', task: 'onboarding-1', pass: '03-onboarding', locale: 'fr-FR', width: 390, attemptBudget: 2 });
let outcome = 'PARTIAL';
try {
  await s.page.goto(BASE + '/');
  s.step('open the invitation');
  const joined = await s.attempt('join group', async () => { await s.page.getByRole('button', { name: /rejoindre/i }).click(); });
  await s.shot('after-join');
  outcome = joined ? 'COMPLETED' : 'ABANDONED';
} finally {
  console.log(JSON.stringify(await s.finish(outcome)));
}
```

Gold lanes use `runGold(id, drive, { pass })` instead; the harness decides the
outcome.

## References

- `reference/friction-metrics.md` - every metric, the score formula, exit checks
- `reference/research-panel.md` - lenses, finding shape, severity rubric, synthesis
- `reference/personas.md` - cast design, constraints, tiers, refinement
- `reference/safety.md` - guards, no-infra rule, secrets, mail, markers
- `reference/session-adapters.md` - adapter interface + two worked examples
