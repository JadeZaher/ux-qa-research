---
type: Reference
title: UX research panel
description: Lenses, evidence rules, outputs and the severity rubric for the Panel and Synthesis phases.
---

# UX research panel

The swarm produces behaviour; the panel turns behaviour into insight. Each lens
is a separate agent reading the same evidence, so disagreements surface instead
of being averaged away by one reviewer.

## Evidence (and what is out of bounds)

Lenses read `ux-report.json`, every `runs/*/ux.json` (steps, page events,
workarounds, attempts, abandonment, errors, axe), the screenshots, and the lane
summaries. They do **not** read application source: the panel judges the
experience, triage judges the code. `trace.zip` is for human replay
(`npx playwright show-trace <file>`), not for agents and never for publication
(it contains request headers).

## Lenses

| Lens | Asks |
|---|---|
| Service designer | Where does the end-to-end service break across touchpoints, roles and hand-offs (author -> reviewer, admin -> member)? |
| Accessibility specialist | Which WCAG 2.1 AA criteria fail (cite numbers), and what did the keyboard-only, accessibility-tree-only, 200% zoom and slow-network runs hit that others did not? |
| Domain expert | Do flows, terms, defaults and outputs make sense to a practitioner in this product's domain? What domain step is missing? |
| Frontline worker | For a busy, interrupted, repeat user: speed, recoverability, re-entry, what a mistake costs. |
| Learning designer | Discoverability, onboarding, progressive disclosure; does a new user form a correct mental model? |
| Content designer | Labels, microcopy, errors, empty states, locale quality; reading level against the low-literacy runs. |
| Trust / behavioural | Perceived risk, consent and privacy cues, defaults, dark patterns, motivation, where and why people drop off. |

A study can restrict the set with `lenses` in its config; domain products may
add a lens in `extraRules` (for example a clinician lens).

## Finding shape

Every finding is a **hypothesis** with: evidence paths, routes, a Nielsen
heuristic (or none), a JTBD gap (or none), impact, frequency, segment breadth,
confidence, and how a human session would confirm or kill it.

Nielsen's heuristics, cited by number: 1 visibility of system status, 2 match
between system and the real world, 3 user control and freedom, 4 consistency
and standards, 5 error prevention, 6 recognition rather than recall,
7 flexibility and efficiency of use, 8 aesthetic and minimalist design,
9 help users recognise, diagnose and recover from errors, 10 help and
documentation.

## Severity rubric

```
severity score = impact x frequency x segmentBreadth        (each 1..3, score 1..27)

impact          1 annoyance   2 costly detour or workaround   3 goal failure, data loss, harm, exclusion
frequency       1 one journey 2 several journeys              3 most journeys through that path
segmentBreadth  1 one constrained segment  2 several segments 3 every segment
```

| Score | Band | Ledger severity |
|---|---|---|
| 18-27, or impact 3 on a gold task | critical | HIGH (BLOCKER if no workaround exists) |
| 8-17 | serious | MEDIUM |
| 1-7 | minor | LOW |

Accessibility exception: an impact-3 barrier for one segment (breadth 1) is
still at least MEDIUM - excluding a group is not a minor issue because the
group is small.

## Synthesis outputs (`synthesis.md`)

1. **Affinity map** - themes, each with merged findings and the lenses that
   raised them. Keep contradictions visible ("content designer: label is
   clear; low-literacy runs: 3/3 abandoned here").
2. **Friction heatmap narrative** - the top routes from the heatmap explained
   in user terms: what people were trying to do there and what happened.
3. **Heuristic violations** - table: heuristic, route, evidence, severity.
4. **JTBD gaps** - jobs users hired the product for that it does not do or
   does only through a workaround.
5. **Ranked findings** - by severity score, with band.
6. **Gold tasks and trend**.
7. **Human validation plan** - findings are hypotheses for human validation.
   Recommend **5 human sessions per affected segment** (the classic
   diminishing-returns point for qualitative usability testing), and say for
   each session what it must test and what result would kill the hypothesis.
8. **Limits** - agents are not users: they are patient, literate, never
   distracted, and can read source. Say which findings that bias could
   inflate or hide.

## How triage uses the panel

Triage may mark a panel finding FIX only when it is confirmed in code and
backed by `ux.json` evidence; everything else becomes `RESEARCH_QUESTION` and
goes into the validation plan. This keeps hypotheses from becoming code churn.
