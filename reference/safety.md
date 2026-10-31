---
type: Reference
title: Safety rules
description: Guards, the no-infrastructure rule, secrets handling, mail sinks, marker tagging and real-user protection.
---

# Safety

Every rule here exists because a real run broke it once.

## Guards (two, independent)

1. **Identity-endpoint guard, outside the target** - `lib/guard.mjs` fetches
   `baseUrl + guard.path` and requires `guard.field === guard.equals`
   (e.g. `GET /api/platform` -> `deploymentKey == "test-tenant"`).
   `uxSession` calls it before launching a browser; the Guard phase calls it
   before anything else; the adapter calls its own copy before any write.
   No `guard` configured is accepted **only** for localhost. `guard.forbidHosts`
   is a deny-list checked first (put your production domains there), so a
   misconfigured identity field cannot open prod.
2. **In-target guard, inside the adapter** - the code that writes rows runs a
   second check *in* the target process (environment variable or config value
   that only the test deployment has) and exits non-zero otherwise. Two
   checks with different failure modes: a stale DNS record defeats the first,
   a copied env file defeats the second, rarely both.

## No infrastructure changes by agents (HARD RULE)

An agent once changed environment configuration mid-run "to unblock" a lane.
Agents never change environments, services, variables, secrets, feature flags,
DNS or deployments, never run deploy/infra CLIs and never `git push`. A
misconfigured environment is an **OWNER** defect in the ledger and the lane
continues. Push/deploy between passes is the coordinator's step, through the
project's hook (commands/loop.md), never an agent's.

## Secrets

- Sessions (cookies, storage state) live in `uxqa/.secrets/` (gitignored by
  setup). Lanes import them through `uxSession`; nobody prints the file.
  Verify it with a count of entries, never with `cat`.
- A crashed child process once echoed environment keys into a transcript.
  Pass secrets to adapters through **stdin or environment**, never argv, and
  reduce adapter output to status lines (`SEEDED 24`, `LINK <url>`, `REFUSED
  ...`). Filter remote tool chatter before it reaches the agent.
- `trace.zip` contains request headers, including cookies. `uxqa/passes/*/runs/`
  is gitignored and the report command never publishes traces; publish
  screenshots and `ux-report.json` only.

## Mail and notifications

The test environment must run mail in **sink** mode (nothing delivered). If it
cannot, the study's `extraRules` must forbid every action that notifies
anyone: invites to real addresses, mentions, messages, password resets. Seed
emails use a reserved domain (`example.com`).

## Marker tagging

Everything a pass creates carries the marker `<marker>-p<N>` in a name, title
or body, and every seeded handle matches the adapter's handle rule. This makes
created content findable for cleanup and impossible to confuse with real
content in screenshots.

## Never act on real users

Test environments get cloned from production. Lanes act only on seeded
personas and marker-tagged content; never ban, delete, edit, message, change
the role of, or export data for an account that is not a seeded persona.
Adapters refuse non-matching handles (`qa(h)` in the worked example).

## Claims are re-run by the coordinator

Fix lanes and integrators report test, typecheck and build results; agents
have reported green on runs that never happened. The verdict stays
`PENDING_COORDINATOR_RERUN` until the coordinator has re-run every listed
command itself and pasted the result lines. Reviews try to refute; a review
that "could not verify" is `REQUEST_CHANGES`, not `APPROVE`.

## Triage confirms against code

A lane defect is a report, not a fact. Triage confirms it at `file:line`
before it becomes FIX, and treats permission-correct or by-design states as
NOT_A_BUG. Panel findings need code confirmation plus `ux.json` evidence.
