---
type: Changelog
title: ux-qa-research changelog
---

# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-18

First release, generalised from a production multi-tenant app's QA harness
and its persona-swarm, fix-iteration and product-assessment-dialectic workflow
scripts.

### Added
- Method skill `ux-qa-research`: `uxqa/` OKF study bundle, 13 gated phases,
  exit criteria, model tiering, coordinator duties.
- Commands `setup`, `pass`, `loop`, `report`, `status`.
- `workflows/pass.generic.js` (adds Guard, Metrics, Research Panel and
  Synthesis phases, gold and probe lanes, persona constraints and model tiers,
  verdict draft pending coordinator re-run) and `workflows/dialectic.generic.js`.
- `lib/`: config-driven `ux-lib` (cookie / cookies / storageState sessions,
  zoom, keyboard-only pointer detection, accessibility-tree and visible-text
  perception, API call capture), `friction` (single source of weights,
  `FRICTION_VERSION` 1), `route-inventory` (SvelteKit, Next app, Next pages),
  `ux-report` (API coverage, friction per journey, exit checks), `gold-tasks`
  (predicate-judged harness), `guard` (identity endpoint + host deny-list),
  `self-test` (localhost end to end) and unit tests.
- References: friction metrics, research panel, personas, safety, session adapters.
- Templates: study, runbook, pass scenario and verdict, gitignore, example
  personas, Railway-SSH + Prisma adapter (sanitised) and login-form adapter.
- Vendored axe-core 4.10.2 (MPL-2.0) as the default WCAG scanner.

### Changed relative to the reference harness
- Heatmap errors now include uncaught `jserror` events, matching the per-run
  `consoleErrors` metric.
- `uxSession` refuses to start unless the guard passes (previously only the
  adapter checked).
- `[...rest]` matches one or more segments for Next.js, zero or more for SvelteKit;
  `@` segments are Next parallel-route slots only in the app router.
