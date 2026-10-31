---
type: Reference
title: Session adapters
description: The adapter interface that seeds personas and mints sessions, its refusal contract, and two worked examples.
---

# Session adapters

The only project-specific code in a study. Everything else in the plugin is
generic; the adapter knows how *this* product creates accounts and sessions.

## Interface

The study config names the commands (`adapter.seed`, `adapter.link`,
`adapter.guard`); `{personas}` and `{out}` are substituted by the Seed phase.

| Command | Does | Stdout (only this) | Exit |
|---|---|---|---|
| `<adapter> guard` | proves the target is the test environment | `OK <identity>` or `REFUSED <reason>` | 0 / 2 |
| `<adapter> seed <personas.json> <out.json>` | upserts every persona (and `seed` fixtures), mints one session each, writes `out.json` | `SEEDED <n>` | 0 / 2 refused / 1 error |
| `<adapter> link <handle>` | one-time sign-in link for a human to look as that persona | `LINK <url>` | 0 / 2 / 1 |

`out.json` is an array, one entry per persona:

```json
[{ "handle": "qa-maria", "cookie": "<session cookie value>" },
 { "handle": "qa-lee", "storageState": "uxqa/.secrets/state-qa-lee.json" },
 { "handle": "qa-sam", "cookies": [{ "name": "sid", "value": "...", "domain": "app.test" }] }]
```

`cookie` uses `session.cookieName` / `session.cookieDomain` from the config;
`cookies` gives full control; `storageState` is a Playwright storage-state
file (or object) and wins over both.

## Contract (non-negotiable)

1. **Refuse non-test environments** - run the guard before any write, and a
   second guard *inside* the target before touching data (reference/safety.md).
2. **Refuse non-persona handles** - writes only rows whose handle matches the
   study rule (`^qa-[a-z0-9-]+$`), and only those rows' memberships/sessions.
3. **Idempotent** - re-seeding the same file updates, never duplicates.
4. **Secrets never on argv or stdout** - signing keys stay inside the target;
   files move over stdin; output reduced to the status lines above.
5. **Never mints for a lane** - lanes that lose a session report it; the
   coordinator re-runs `seed`.

## Worked example A: Railway SSH + Prisma (sanitised from a production app)

`templates/adapters/railway-ssh-prisma/`. The test tenant has its own database
and an app container with Prisma and the signing secret. The adapter never
pulls the secret out; it pushes small scripts *in*, runs them there, and pulls
back only the sessions line.

```
adapter.sh guard                     curl GET $BASE/api/platform -> deploymentKey must equal $GUARD_VALUE
adapter.sh seed personas.json out    push in-target-guard.mjs, seed.mjs, personas.json over ssh stdin
                                     -> node seed.mjs inside the container (imports the in-target guard first)
                                     -> stdout filtered to the "SESSIONS [...]" line -> out.json
adapter.sh link qa-x                 push link.mjs -> one-hour magic-link row -> "LINK <url>"
```

Smart parts worth copying:
- `push() { railway ssh ... -- sh -c "cat > /app/qa-$1" < "$2"; }` moves files
  over **stdin**, so nothing sensitive is on a command line.
- The in-target guard checks the container's own `ENVIRONMENT` and deployment
  key; the local guard checks the public identity endpoint. Two failure modes.
- The seed script replicates the app's token format (HMAC-signed JWT with the
  in-container secret) instead of calling a login endpoint, so no mail is sent
  and no password exists.
- `quiet()` strips the remote CLI's chatter; `sed -n 's/^SESSIONS //p'` keeps
  only the payload line, so a crash prints a status, not an environment dump.

## Worked example B: login form + storage state

`templates/adapters/login-form/adapter.mjs` - for apps where test accounts
already exist with a shared test password (seeded by the app's own fixture
script). `seed` signs each persona in through the real login form and saves a
Playwright storage state per persona. The password comes from the environment
(`UXQA_TEST_PASSWORD`), never from argv or a file in the repo. It loads the
plugin's config and guard modules from `UXQA_PLUGIN_LIB`, so its seed command
looks like `UXQA_PLUGIN_LIB=<plugin>/lib node uxqa/adapter/adapter.mjs seed {personas} {out}`.

## Writing a new adapter

Start from B if your app has test passwords, from A if you can run code next to
the database. Either way: implement `guard` first, run `/ux-qa-research:setup`
to smoke-test it, and keep the adapter in the target repo (`uxqa/adapter/`),
not in the plugin.
