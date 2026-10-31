---
type: Reference
title: Friction metrics
description: Exact definitions of every per-run metric, the friction score, per-route heatmap, gold tasks and exit checks.
---

# Friction metrics

Agents report "COMPLETED" far too easily. The method replaces their opinion with
counts captured in the page (`lib/ux-lib.mjs`), computed by one pure module
(`lib/friction.mjs`), and aggregated per pass (`lib/ux-report.mjs`). Numbers
are comparable across passes only while `FRICTION_VERSION` is unchanged.

## Per-run metrics (`ux.json` -> `metrics`)

| Metric | Definition |
|---|---|
| `outcome` | `COMPLETED` / `PARTIAL` / `ABANDONED` / `BLOCKED`, set by `finish()`. For gold tasks it is set by the harness predicate, never by the agent. |
| `seconds` | `endedAt - startedAt`, rounded. Includes agent think time, so compare it only within one model tier. |
| `clicks` | Click events observed in the page (pointer or keyboard activation). |
| `deadClicks` | Clicks after which, within 1.2 s, there was no DOM mutation, no `fetch` activity and no URL change. A click whose page unloads before the verdict (`pagehide`) is live. |
| `rageClicks` | Clicks where at least 2 of the previous 3 clicks were within 1000 ms and 30 px. A burst of 3 counts 1, a burst of 4 counts 2. |
| `inputs` | `change` events on form controls. |
| `validationErrors` | `invalid` events (native constraint validation). Reported, **not scored**: inline validation is often the UI working. |
| `pageViews` / `distinctPages` | Main-frame navigations / distinct paths among them. |
| `revisits` | Navigations to a path already seen in this run (loops, backtracking). Reported and shown per route, **not scored** (some flows legitimately return to a hub). |
| `httpErrors` | Same-origin responses with status >= 400. |
| `consoleErrors` | `console.error` messages plus uncaught `window.onerror` events. |
| `failedAttempts` | Sum over `attempt()` sub-goals of failed tries (`tries - 1` if it eventually succeeded, `tries` if not). |
| `workarounds` | `workaround(why)` calls, plus every `request()`/`trpc()` in a ui-only run, plus every pointer click in a `keyboardOnly` run. |
| `abandoned` | First sub-goal whose attempt budget ran out: `{ name, path, afterTries }`. |
| `axeViolations` | Count of violated axe rules summed over each `axe()` scan in the run (one rule on one page counts once, however many nodes). |
| `apiCalls` | Same-origin API requests observed (tRPC procedures split from batches; REST paths id-normalised). Feeds API coverage. |
| `friction` | The friction score of this run (below). |

## The friction score

```
friction = 10 x abandons
         +  6 x workarounds
         +  3 x rageClicks
         +  2 x errors          (httpErrors + consoleErrors + failedAttempts)
         +  2 x deadClicks
         +  1 x axeViolations
```

`abandons` is 1 when the run recorded `abandoned` or ended `ABANDONED`.

Why these weights: the order is "how sure are we a real user would have
failed". Abandonment is goal failure (10). A workaround means the UI could not
do it and only an agent with source or API knowledge got through (6, nearly an
abandonment; for a real user it usually is one). Rage clicks are visible
frustration (3). Errors and dead clicks are probable confusion but can be
benign (2). An axe violation is a definite barrier for some segment but its
effect on this journey is unknown (1).

## Per-route heatmap (`ux-report.json` -> `heatmap`)

Each event is attributed to the route its page path matches in the route
inventory (`lib/route-inventory.mjs`): dead clicks, rage clicks (route of the
click completing the burst), errors (each `errors[]` entry and `jserror`),
workarounds, abandons (abandon path, else the last navigation), axe violations,
and revisits (display only). `friction` per route uses the same weights.
Paths that match no route appear in `coverage.unmatchedPaths`; a non-empty list
usually means a wrong `routes.dir` or a missing `ignorePrefix`.

## Pass-level numbers

- `frictionPerJourney` = sum of `friction` over **ui-only** runs / number of
  ui-only runs. Probe runs never count: they are not UX.
- `coverage.visited / pageRoutes` - page routes reached at least once.
- `coverage.api.hit / declared` - declared endpoints exercised (file-router
  endpoints, or a tRPC `api.proceduresFile` list); `observedOps` lists what
  was actually called.
- `axeRules` - each violated rule with the routes it appeared on. Rule set:
  `wcag2a`, `wcag2aa`, `wcag21aa`, run by axe-core 4.10.2 vendored in the
  plugin at `vendor/axe.min.js` (MPL-2.0, licence in
  `vendor/axe-core.LICENSE`). A study may pin another build with `axePath`.

## Gold tasks

A gold task is a fixed, user-worded goal (`goldTasks` in `study.md`) with a
success predicate: `urlMatches` (regex on the final path), `textVisible`,
and/or `roleVisible {role, name}` - all declared conditions must hold. Gold
runs are forced ui-only, use the persona's attempt budget and a time limit
(`maxSeconds`, default 300: timeout -> `ABANDONED`; driver crash ->
`BLOCKED`; predicate false -> `PARTIAL`). The same id across passes gives
`goldTrend[task][pass] = { runs, successRate, medianClicks, medianSeconds,
medianFriction }`. Keep gold tasks stable; add new ones rather than editing.

## Exit checks (`ux-report.json` -> `exitChecks`)

| Check | Passes when |
|---|---|
| `goldSuccess` | every declared gold task ran this pass and each `successRate >= targets.goldSuccess` (default 0.8) |
| `frictionTrend` | `frictionPerJourney <= previous x (1 + targets.frictionTolerance)` (default 10%); `null` on the first pass |
| `newHigh` | ledger entries with severity BLOCKER/HIGH, `introducedIn` this pass, not NOT_A_BUG/DUPLICATE, not `FIXED` <= `targets.newHigh` (default 0) |
| `routeCoverage` | visited ratio >= `targets.routeCoverage` (off when null) |

The pass verdict adds two rows the report cannot decide: the adversarial review
verdict and the coordinator's own re-run of every test/typecheck/build claim.
