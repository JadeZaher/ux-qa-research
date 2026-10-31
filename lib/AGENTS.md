---
type: Module Notes
title: ux-qa-research lib
description: Why the capture, metrics and inventory libraries are shaped the way they are.
---

# lib/ - capture, metrics, inventory

Plain Node ESM, no dependencies of its own. Playwright is imported from the
**target repo** (`config.playwright`, resolved with `createRequire` from the
repo's `package.json`), so the plugin never pins a browser version that fights
the product's own.

| File | Role |
|---|---|
| `study-config.mjs` | Finds `uxqa/study.md`, parses its ` ```json uxqa-config ` block, applies `UXQA_*` env overrides, resolves paths against the repo root. |
| `guard.mjs` | Identity-endpoint guard. Called by `uxSession` before any browser starts, and as a CLI by setup and the adapter. |
| `ux-lib.mjs` | `uxSession()` - one instrumented persona journey -> `runs/<persona>--<task>/{trace.zip, ux.json, *.png}`. |
| `friction.mjs` | Pure metric + score functions. The only place weights live. |
| `route-inventory.mjs` | File-router inventory (SvelteKit, Next app, Next pages) -> page and API tables with URL matchers. |
| `ux-report.mjs` | Aggregates one pass -> `ux-report.json` (coverage, heatmap, scorecards, axe rules, gold trend, exit checks). |
| `gold-tasks.mjs` | Gold-task harness: predicate-judged, ui-only, time-limited runs. |
| `self-test.mjs` | Localhost end-to-end check of all of the above. Never touches a deployed environment. |
| `test/` | `node --test lib/test/*.test.mjs` - table-driven tests for the pure logic. |

## study-config

The machine config lives *inside* `study.md` (one fenced block) rather than a
sibling JSON file, so the human-readable study and the values the scripts use
cannot drift apart. Conductor keeps `metadata.json` beside `plan.md`; here the
block is small enough that one file is cheaper than a sync rule.

## ux-lib

- **Events stream out through `exposeBinding`**, not `window` state: a full
  navigation wipes `window`, and the click that caused it would be lost.
- **Dead click** = no DOM mutation, no fetch activity and no URL change within
  1.2 s. `pagehide` marks every pending click live, because a page that unloads
  before the timer fired was navigated away from by that click.
- **`pointer: e.detail > 0`** separates mouse clicks from keyboard activation;
  in a `keyboardOnly` run every pointer click becomes a workaround at `finish`.
- **ui-only vs probe.** `request()`/`trpc()` in a ui-only run are logged as
  workarounds (hard friction); in probe mode they are logged as probes. Agents
  are not users: given an API they will use it, so the default is ui-only and
  the cost is made visible instead of forbidden.
- **Zoom** is modelled as viewport / zoom at `deviceScaleFactor = zoom`, which is
  what a browser at 200% does to CSS pixels.
- **Secrets** stay inside `loadSession()`. Logs carry paths and statuses only;
  query strings are stripped from HTTP error URLs. `trace.zip` *does* contain
  request headers (cookies): it is gitignored and never published
  (reference/safety.md).
- **axe-core** (MPL-2.0, `vendor/axe.min.js`, see `vendor/README.txt`) is
  injected from the plugin's own `vendor/` by default; a study can pin another
  build with `axePath`. Rule set: `wcag2a`, `wcag2aa`, `wcag21aa`.

## route-inventory

Segments are tokenised, literals regex-escaped, params replaced:
`[x]` -> one segment, `[[x]]` -> optional segment, `[...x]` -> rest (may be
empty in SvelteKit, one or more segments in Next), `[[...x]]` -> optional rest.
`(group)` is dropped everywhere; `@slot` is dropped **only** for the Next app
router, because SvelteKit's `@` is literal (`/@[userHandle]`). Intercepting
routes `(.)x` and Next private folders `_x` are skipped. Matching sorts by
static-segment count then fewest dynamic segments, so `/a/new` beats `/a/[id]`.
`routes.ignorePrefix` strips a locale or base-path prefix before matching.

## ux-report

Exit checks it can decide alone: gold success, friction trend, route coverage,
and new HIGH (only when `ledger.json` exists). Review verdict and the
coordinator's re-run of tests are recorded in `verdict.md`, not here.

## gold-tasks

The success predicate (`urlMatches` / `textVisible` / `roleVisible`) is evaluated
by the harness after the driver returns; `list` hides it from lane agents so
they cannot steer at the check. A gold run is forced to `mode: 'ui-only'`.
