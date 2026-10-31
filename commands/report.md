---
description: Aggregate a UX study across passes - trends, cross-pass research synthesis, optional dialectical product assessment and published artifact
argument-hint: [--dialectic] [--publish]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Workflow
model: inherit
---

# Study report

`PLUGIN` = `${CLAUDE_PLUGIN_ROOT}` (else the `installPath` of
`ux-qa-research@local` in `~/.claude/plugins/installed_plugins.json`).

## 1 Refresh metrics

For every `uxqa/passes/NN-*` (not 00-setup) without a current `ux-report.json`,
run `node PLUGIN/lib/ux-report.mjs <pass>`. The latest report's `goldTrend` and
`frictionByPass` already span all passes.

## 2 Cross-pass tables (write `uxqa/report.md`, `type: UX Study Report`)

1. **Trend** - per pass: scenario, runs, gold success per task, friction per
   journey, route coverage, new HIGH, ledger FIX/DEFER/OWNER/RESEARCH_QUESTION,
   verdict status.
2. **Persistent friction** - routes in the top 10 of the heatmap in two or more
   passes, with what was tried.
3. **Accessibility** - axe rules by pass (rule, impact, routes), and which
   constrained segments abandoned where.
4. **Research synthesis across passes** - one opus agent reads every
   `synthesis.md` and the ledgers: themes that persist, findings resolved by
   fixes (with the metric that moved), hypotheses still unvalidated, and the
   consolidated **human validation plan** (5 sessions per affected segment,
   what each must test, what would kill each hypothesis).
5. **Limits** - agents are not users; which conclusions that bias could change.

## 3 Optional: dialectical product assessment (`--dialectic`)

`Workflow({ scriptPath: "PLUGIN/workflows/dialectic.generic.js", args })` with
`{ date, product, studyDir, passes: [...], codeRepo, planDocs: [...],
claimSources: [...], modules: [...], currentPlan, alternatives, observableOn,
outPath: "<repo>/uxqa/assessments/product-assessment-<date>.md" }`. It runs
assess (product / claims / plan) -> thesis + antithesis -> synthesis -> attack
-> revise -> write. Link the result from `report.md`.

## 4 Optional: published artifact (`--publish`)

Build a shareable version of `report.md` (markdown or a single HTML file) with
selected screenshots copied next to it. **Exclude** `trace.zip`, raw `ux.json`
logs, the sessions file, flow scripts and anything under `.secrets/`;
screenshots must show only seeded personas and marker-tagged content. Say
where it was written; publishing it anywhere external is the user's step.

## 5 Reply

Verdict in 5 lines, the trend table, the top persistent friction routes, the
validation plan summary, and `file:line` links to `report.md` and any
assessment.
