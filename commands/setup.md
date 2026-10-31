---
description: Create a UX study (uxqa/) in this repo, prove the environment guard, smoke-test the session adapter and ux-lib
argument-hint: [base-url]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
model: inherit
---

# UX study setup

Creates the `uxqa/` OKF bundle in the current repo and proves every moving part
on the real test environment before any pass may run. Method:
`skills/ux-qa-research/SKILL.md`. Safety: `reference/safety.md`.

`PLUGIN` below is `${CLAUDE_PLUGIN_ROOT}`; if it is not expanded, use the
`installPath` of `ux-qa-research@local` in `~/.claude/plugins/installed_plugins.json`.

## 0 Pre-flight

1. If `uxqa/study.md` exists, read it and `uxqa/RUNBOOK.md`; offer to re-verify
   (jump to step 3) instead of overwriting.
2. Discover before asking (never ask what the repo answers):
   - framework and routes dir: `node PLUGIN/lib/route-inventory.mjs <dir>` on
     `src/routes`, `app`, `src/app`, `pages`, `src/pages` - keep the one with pages;
   - API style: tRPC if `@trpc/server` is in `package.json`, else REST;
   - Playwright: `node -e "console.log(require.resolve('playwright'))"` from the
     repo root (if absent, tell the user to add it as a dev dependency; do not install it yourself);
   - test / typecheck / build scripts from `package.json`;
   - an identity endpoint candidate (grep for `deploymentKey`, `/api/health`,
     `/api/platform`, `environment` in route handlers).

## 1 Interview (one round, at most 4 questions, recommended option first)

Ask only what discovery could not answer, typically:
1. The **test environment base URL** (never production) and the **guard**:
   endpoint + field + expected value that only the test environment returns.
2. **Production hosts** to deny-list.
3. **Session adapter**: Railway-SSH + Prisma style (code next to the DB),
   login-form with a shared test password, or an existing project script.
4. **Gold tasks**: 3-6 goals in user words with a success signal.

Everything unasked becomes a stated default in `study.md` (attempt budget 3,
targets 0.8 / 0 / 10%, all seven lenses, marker `uxqa`).

## 2 Write the bundle

1. `uxqa/study.md` from `PLUGIN/templates/study.md`: fill prose AND the
   ` ```json uxqa-config ` block (the scripts read only the block).
2. `uxqa/RUNBOOK.md` from `PLUGIN/templates/RUNBOOK.md`.
3. `uxqa/.gitignore` from `PLUGIN/templates/gitignore`; confirm with
   `git check-ignore uxqa/.secrets/x uxqa/passes/01-a/runs/x` that both are ignored.
4. Adapter: copy the chosen `PLUGIN/templates/adapters/<kind>/` to
   `uxqa/adapter/` and adapt it (model names, token format, selectors,
   in-target guard values). Put the commands into `adapter.seed`/`link`/`guard`.

## 3 Verify (each line is a gate; stop at the first failure and report it)

Run from the repo root and record each result line in the RUNBOOK setup block:

1. `node PLUGIN/lib/guard.mjs` -> must print `OK <baseUrl> <field>=<value>`.
2. Adapter guard (`adapter.guard`) -> `OK ...`.
3. Adapter smoke: write a one-persona file (`qa-uxqa-smoke`) to
   `uxqa/passes/00-setup/personas.json` and run `adapter.seed` with
   `{out}` = the sessions file. Expect `SEEDED 1`. Verify the sessions file
   with a count only:
   `node -e "console.log(JSON.parse(require('fs').readFileSync('uxqa/.secrets/sessions.json','utf8')).length)"`.
   Never print it.
4. ux-lib smoke: a 10-line script that runs
   `uxSession({ handle: 'qa-uxqa-smoke', task: 'setup-smoke', pass: '00-setup' })`,
   opens `/`, takes one shot, calls `axe()`, and `finish('COMPLETED')`.
   Expect `runs/qa-uxqa-smoke--setup-smoke/{ux.json,trace.zip}`.
5. `node PLUGIN/lib/ux-report.mjs 00-setup` -> coverage `1+/N pages` and an
   empty or explained `unmatchedPaths`.
6. `node PLUGIN/lib/gold-tasks.mjs check` -> every gold task valid.

Optional, any time, no network: `node PLUGIN/lib/self-test.mjs` (localhost
only) and `node --test PLUGIN/lib/test/*.test.mjs`.

## 4 Hand-off

Print the study summary (target, guard line, routes count, gold tasks), the
RUNBOOK path, and the next command: `/ux-qa-research:pass <scenario-slug> "<brief>"`.
Do not commit; suggest the user commits `uxqa/` (secrets and runs are ignored).
