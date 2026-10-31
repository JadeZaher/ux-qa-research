---
type: Pass Verdict
pass: "{{NN}}-{{slug}}"
scenario: "{{slug}}"
status: PENDING_COORDINATOR_RERUN
---

# Verdict - pass {{NN}}-{{slug}}

## 1 Exit checks

| Check | Target | Result | OK |
|---|---|---|---|
| Gold task success | >= {{0.8}} each | {{...}} | |
| Friction per journey | <= previous x 1.1 | {{prev -> now}} | |
| New HIGH/BLOCKER open | {{0}} | {{n}} | |
| Route coverage | {{target or off}} | {{a/b}} | |
| Adversarial review | APPROVE | {{...}} | |
| Coordinator re-run | green vs baseline | PENDING | |

## 2 Claims to re-run

{{every command the fix lanes and integrator reported, verbatim}}

## 3 Ledger summary

## 4 Persona refinement

## 5 Next scenario
