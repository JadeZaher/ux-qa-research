---
description: Show the state of the UX study - passes, latest exit checks, open items, next step
allowed-tools: Read, Glob, Bash
model: claude-haiku-4-5-20251001
---

# Study status

1. No `uxqa/study.md` -> "Run `/ux-qa-research:setup`." and stop.
2. Read in parallel: `uxqa/study.md` (product, baseUrl, gold task ids),
   the first pass block of `uxqa/RUNBOOK.md`, and `ls uxqa/passes/`.
3. For the latest pass: `verdict.md` frontmatter `status`; `ux-report.json`
   `exitChecks`, `frictionPerJourney`, `coverage.visited/pageRoutes`, top 5
   `heatmap` routes; `ledger.json` counts by decision and open BLOCKER/HIGH.
4. Do not run the guard, the adapter or any network command (status is read-only).

Report:

- Study: product, target, number of passes.
- Table per pass: id, verdict status, gold success, friction/journey, coverage, new HIGH.
- Latest exit checks with pass/fail per row.
- Open items: BLOCKER/HIGH still open, OWNER items, RESEARCH_QUESTIONs awaiting human sessions, a verdict still `PENDING_COORDINATOR_RERUN`.
- Next: the RUNBOOK "Next" line, or `/ux-qa-research:pass <slug> "<brief>"`.
