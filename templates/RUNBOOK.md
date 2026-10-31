---
type: UX Study Runbook
title: "{{product}} UX study runbook"
description: Rolling state of the study - newest block first; one block per pass with its recorded verdict.
---

# UX study runbook

Newest block first. Each pass appends one block; nothing here is deleted.

## Pass {{NN}}-{{scenario}} - {{date}} - {{APPROVED | CHANGES_REQUESTED | RESEARCH_ONLY | PENDING}}

- **Deployed commit:** {{hash}}
- **Exit checks:** gold {{x/y >= target}}, friction/journey {{prev -> now}}, new HIGH {{n}}, coverage {{a/b}}, review {{verdict}}, coordinator re-run {{green | red vs baseline}}
- **Ledger:** FIX {{n}} (commits {{...}}), DEFER {{n}}, OWNER {{n}}, RESEARCH_QUESTION {{n}}
- **Top friction routes:** {{...}}
- **Persona refinement for next pass:** {{keep / retire / add}}
- **Next:** {{scenario}}, {{push/deploy owner step if fixes landed}}

## Study setup - {{date}}

- Guard proven: `{{OK line}}`
- Adapter smoke: `{{SEEDED n}}`
- ux-lib smoke: `{{ux-report coverage line}}`
