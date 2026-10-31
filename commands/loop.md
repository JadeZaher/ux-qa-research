---
description: Run N UX passes with scenario rotation, stopping early when exit criteria hold for two consecutive passes
argument-hint: <N> [scenario-slug:"brief" ...]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Workflow
model: inherit
---

# Pass loop

Runs `/ux-qa-research:pass` up to N times. The coordinator owns everything
between passes; agents never push, deploy or wait on infrastructure.

## Scenario rotation

Use the scenarios given as arguments in order; when they run out, take the
"Next scenario" suggestion from the previous `verdict.md`; if that repeats a
scenario from the last two passes, pick the least-covered feature area from
the latest `ux-report.json` `coverage.unvisited`. Gold tasks run every pass
regardless of scenario (that is what makes their trend meaningful).

## Between passes (project hooks)

The study config may define (all optional, all run by the coordinator):

```json
"hooks": {
 "afterFix": "<command that publishes local fix commits, e.g. open a PR - or null to stop and ask the user>",
 "waitDeploy": "<command that exits 0 once the test environment serves the expected commit>",
 "beforePass": "<any reset, e.g. clear marker-tagged content>"
}
```

Order after each pass that produced commits: `afterFix` -> `waitDeploy` ->
guard -> `beforePass`. With no `afterFix` hook, stop the loop and ask the user
to push/deploy: fixes that are not deployed cannot be re-checked, and running
the next pass against the old build wastes it. Research-only passes skip the
hooks.

## Stop conditions

- Exit criteria (SKILL.md) met in two consecutive passes -> stop, report "study converged".
- Guard fails -> stop immediately.
- Two consecutive passes with `CHANGES_REQUESTED` on the same findings -> stop and escalate to the user.
- N reached.

## Each iteration

1. Run the pass procedure (commands/pass.md) end to end, including the
   coordinator re-run and the RUNBOOK block.
2. Print a one-line trend: `pass NN: gold a/b, friction/journey x -> y, new HIGH n, coverage c/d`.
3. Hooks, then the next pass.

Finish with `/ux-qa-research:report`.
