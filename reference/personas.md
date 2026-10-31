---
type: Reference
title: Persona cast design
description: How to design, constrain, tier and refine the persona cast across passes.
---

# Personas

A persona is a seeded account plus a brief an agent plays. The cast is the
experimental design of the study: who it includes decides what the pass can
find.

## Cast design

- **Archetypes from the product's real roles** (owner, admin, member, author,
  reviewer, newcomer, sceptic), each with a concrete **goal** in user words that
  produces an outcome end to end, and a **context** (skills, motivation, what
  they already know).
- **Segments**, not individuals: group personas so findings can be counted per
  segment (`segment` field) - the severity rubric needs segment breadth.
- **Collaborators share a lane**, so cross-persona flows (invite -> accept,
  author -> reviewer, admin grants -> member uses) happen inside one agent's
  context and hand-offs are observed.
- **Scenario-native**: every pass has a scenario; the cast's organisations,
  goals and lanes are shaped by it while every feature area is still touched
  at least once across the study.
- **Handles** follow the adapter's rule (e.g. `^qa-[a-z0-9-]+$`) so the adapter
  can refuse anything else and cleanup can find every row.

## Constrained personas (cosmetic diversity is not diversity)

Twenty personas who all read perfectly, click precisely, wait forever and see
1366 px are one persona. At least a third of the cast carries a constraint,
spread across segments:

| Constraint | uxSession option / channel | What it reveals |
|---|---|---|
| keyboard-only | `keyboardOnly: true`; pointer clicks become workarounds | focus order, traps, unreachable controls |
| accessibility-tree only | perceive via `outline()`, act via `getByRole` | missing names/roles, div buttons, unlabelled fields |
| 200% zoom | `zoom: 2` | reflow, clipped dialogs, hidden actions |
| slow network | `slow: true` (400 ms, 200 kB/s) | missing loading states, double submits |
| locale | `locale: 'fr-FR'` etc. | untranslated strings, layout overflow, date/number formats |
| low literacy | perceive via `text()`, act only on visible words | jargon, instructions that rely on icons or prior knowledge |
| mobile | `width: 390` | layout, tap targets, hidden navigation |
| impatience | `patience` 1-2 (attempt budget) | which flows only work for persistent users |

## Model tiers

Mix tiers deliberately: `haiku` plays low-literacy and impatient personas (it
gives up and misreads more like a hurried human), `sonnet` most personas,
`opus` at most two expert personas (methodologist, auditor). A defect only an
opus lane finds is often an expert-path issue; one only haiku lanes hit is
often a clarity issue. The lane model is the lane's `modelTier`.

## Refinement between passes

The Verdict phase writes a "Persona refinement" section from lane feedback
and coverage gaps. The next Personas phase applies it:

- **Keep** handles of personas that produced signal (stable handles keep gold
  trends and re-checks meaningful).
- **Retire** personas the lanes called unrealistic or redundant.
- **Add** personas for unvisited routes, segments with no findings, and roles
  a hand-off needed but nobody played.
- **Re-power** personas who could not reach their goal for reasons a real
  user in that role would not have (missing membership, wrong role) - fix the
  seed, not the finding.
- Rotate constraints so each constrained segment meets a different scenario.
