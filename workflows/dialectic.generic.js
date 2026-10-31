export const meta = {
  name: 'ux-qa-research-dialectic',
  description: 'Product assessment from accumulated UX QA passes, then a dialectical synthesis of what to do next: thesis, antithesis, synthesis, attack, revise, write',
  phases: [
    { title: 'Assess', detail: 'module scorecard, claims vs reality, plan state' },
    { title: 'Dialectic', detail: 'thesis and antithesis in parallel, then synthesis' },
    { title: 'Attack', detail: 'critic attacks the synthesis; revise if it holds' },
    { title: 'Write', detail: 'one assessment document' },
  ],
}

// args: { date, product, studyDir, passes: ['01-x', ...], codeRepo, planDocs: [paths], claimSources: [paths or grep hints], modules: [names], currentPlan, alternatives, observableOn, outPath }
const A = args || {}
const PASSES = (A.passes || []).map((p) => A.studyDir + '/passes/' + p)
const OUT = A.outPath || (A.studyDir + '/assessments/product-assessment-' + A.date + '.md')
const SOURCES = [
  'Evidence (read these yourself; cite file:line, a report field or a ledger id for every claim):',
  '- UX QA passes on ' + A.product + ': ' + PASSES.map((p) => p + '/{ux-report.json,ledger.json,synthesis.md,verdict.md}').join(' ') + '. Screenshots under each pass runs/ directory.',
  '- Study: ' + A.studyDir + '/study.md and ' + A.studyDir + '/RUNBOOK.md.',
  '- Plan: ' + JSON.stringify(A.planDocs || []) + '.',
  '- Claims (copy, decks, docs that say what the product does): ' + JSON.stringify(A.claimSources || []) + '.',
  '- Code: ' + A.codeRepo + '. Use it to confirm whether a capability is reachable from a UI, not only present in a router.',
  'Read-only. Be concrete and unflattering; this assessment exists to correct optimism, not to reassure.',
].join('\n')

const ASSESS = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      area: { type: 'string' }, rating: { type: 'string', description: 'SHIPPABLE | USABLE_WITH_GAPS | BACKEND_ONLY | BROKEN | ABSENT' },
      claim: { type: 'string' }, reality: { type: 'string' }, evidence: { type: 'string' }, consequence: { type: 'string' },
    }, required: ['area', 'rating', 'claim', 'reality', 'evidence', 'consequence'] } },
  },
  required: ['summary', 'findings'],
}
const POSITION = {
  type: 'object',
  properties: {
    position: { type: 'string', description: 'the plan this side argues for, as ordered steps' },
    argument: { type: 'string' },
    strongestEvidence: { type: 'array', items: { type: 'string' } },
    concedes: { type: 'array', items: { type: 'string' }, description: 'what this side admits the other side gets right' },
    risksIfWrong: { type: 'string' },
  },
  required: ['position', 'argument', 'strongestEvidence', 'concedes', 'risksIfWrong'],
}
const SYNTH = {
  type: 'object',
  properties: {
    plan: { type: 'array', items: { type: 'object', properties: {
      step: { type: 'string' }, why: { type: 'string' }, exitGate: { type: 'string', description: 'falsifiable, observable on ' + (A.observableOn || 'the test environment') },
      effort: { type: 'string' }, owner: { type: 'string', description: 'agent lanes | owner | external' },
    }, required: ['step', 'why', 'exitGate', 'effort', 'owner'] } },
    keptFromThesis: { type: 'array', items: { type: 'string' } },
    keptFromAntithesis: { type: 'array', items: { type: 'string' } },
    ownerDecisions: { type: 'array', items: { type: 'string' } },
    schedule: { type: 'string' },
    killCriteria: { type: 'array', items: { type: 'string' }, description: 'signals that would mean this synthesis is wrong' },
  },
  required: ['plan', 'keptFromThesis', 'keptFromAntithesis', 'ownerDecisions', 'schedule', 'killCriteria'],
}
const ATTACK = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'SOUND | REVISE' },
    attacks: { type: 'array', items: { type: 'object', properties: { target: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string' }, remedy: { type: 'string' } }, required: ['target', 'problem', 'evidence', 'remedy'] } },
    sycophancyCheck: { type: 'string', description: 'where the synthesis tells the owner what they want to hear' },
  },
  required: ['verdict', 'attacks', 'sycophancyCheck'],
}

// ---- Assess (barrier: the dialectic needs all three readings) ----
phase('Assess')
const [product, claims, planState] = await parallel([
  () => agent(SOURCES + '\nROLE: product assessor. Rate each module (' + JSON.stringify(A.modules || ['every user-facing area you find']) + ') as the study personas would experience it today: which end-to-end jobs a user can complete, which dead-end, which exist only in the backend. Use gold-task trends, friction per journey and the defect trend across passes (found / fixed / re-broken / deferred) as the quality signal.', { label: 'assess:product', phase: 'Assess', schema: ASSESS, model: 'opus', agentType: 'oh-my-claudecode:analyst' }),
  () => agent(SOURCES + '\nROLE: claims-vs-reality auditor. Take every forward-facing claim the product makes as live and set it against what the passes could actually exercise through the UI. Rate each claim SAFE (a user can do it today), BACKEND_ONLY (no UI path), PARTIAL, or FALSE. Flag every claim whose copy is live while its reality is not.', { label: 'assess:claims', phase: 'Assess', schema: ASSESS, model: 'opus', agentType: 'oh-my-claudecode:critic' }),
  () => agent(SOURCES + '\nROLE: plan-state analyst. Where is the plan now, what is left, and the honest schedule. Add what the passes changed: defects deferred into plan items, owner items surfaced, research questions awaiting human sessions, and capabilities found unreachable from the UI that no plan item covers.', { label: 'assess:plan', phase: 'Assess', schema: ASSESS, model: 'sonnet' }),
])
const reading = JSON.stringify({ product, claims, planState })

// ---- Dialectic ----
phase('Dialectic')
const [thesis, antithesis] = await parallel([
  () => agent('THESIS. Using these assessments: ' + reading + '\nArgue the strongest honest case for the CURRENT plan: ' + (A.currentPlan || 'continue the plan as written, folding UX defects into each step') + '. Use evidence. Say what you concede.', { label: 'thesis', phase: 'Dialectic', schema: POSITION, model: 'opus' }),
  () => agent('ANTITHESIS. Using these assessments: ' + reading + '\nArgue the strongest honest case AGAINST the current plan. Candidate lines (choose and justify, do not use all blindly): ' + (A.alternatives || 'make already-claimed capabilities reachable and usable first; fix the highest-friction gold tasks before new scope; run the human validation sessions before building on unvalidated hypotheses; cut scope') + '. Use evidence. Say what you concede.', { label: 'antithesis', phase: 'Dialectic', schema: POSITION, model: 'opus' }),
])
let synthesis = await agent('SYNTHESIS. Thesis: ' + JSON.stringify(thesis) + '\nAntithesis: ' + JSON.stringify(antithesis) + '\nAssessments: ' + reading + '\nProduce a sequenced plan that keeps what each side gets right. Not a compromise average: a plan whose ordering follows dependencies and user-visible truth (no live claim without a reachable, usable path). Every step needs a falsifiable exit gate observable on ' + (A.observableOn || 'the test environment') + ' (a gold-task success rate, a friction trend, a route reachable), an effort range and an owner. List owner decisions and kill criteria.', { label: 'synthesis', phase: 'Dialectic', schema: SYNTH, model: 'opus', agentType: 'oh-my-claudecode:planner' })

// ---- Attack ----
phase('Attack')
const attack = await agent('Attack this synthesis: ' + JSON.stringify(synthesis) + '\nagainst the evidence: ' + reading + '\nLook for: exit gates that cannot actually be observed, hidden dependencies (shared files that serialise work), schedule optimism, owner-gated items treated as agent work, research hypotheses treated as validated facts, and sycophancy (telling the owner what they want). Default to REVISE if anything material is wrong.', { label: 'attack', phase: 'Attack', schema: ATTACK, model: 'opus', agentType: 'oh-my-claudecode:critic' })
if (attack && attack.verdict === 'REVISE') {
  synthesis = await agent('Revise the synthesis to answer every attack that holds (say which you reject and why). Synthesis: ' + JSON.stringify(synthesis) + '\nAttacks: ' + JSON.stringify(attack), { label: 'revise', phase: 'Attack', schema: SYNTH, model: 'opus', agentType: 'oh-my-claudecode:planner' })
}

// ---- Write ----
phase('Write')
const doc = await agent('Write ' + OUT + ' (create the directory if missing). Markdown with YAML frontmatter (type: Product Assessment, date: ' + A.date + ', passes: ' + JSON.stringify(A.passes || []) + ').\nSections: 1 Verdict (5 lines max). 2 Module scorecard (table: area, rating, what a user can do, what dead-ends, evidence). 3 Claims vs reality (every live claim that is BACKEND_ONLY/PARTIAL/FALSE first). 4 Pass results (per pass: gold success, friction per journey, found/fixed/re-broken/deferred, research questions open). 5 The dialectic: thesis and antithesis in one paragraph each with concessions, the attack, the final synthesis. 6 The plan (table: step, why, exit gate, effort, owner), owner decisions, kill criteria, schedule. 7 Sources.\nInputs: product=' + JSON.stringify(product) + ' claims=' + JSON.stringify(claims) + ' plan=' + JSON.stringify(planState) + ' thesis=' + JSON.stringify(thesis) + ' antithesis=' + JSON.stringify(antithesis) + ' attack=' + JSON.stringify(attack) + ' synthesis=' + JSON.stringify(synthesis) + '\nPlain, direct prose. Cite evidence. Do not soften. Do not commit. Return the path and a 10-line summary.', { label: 'write', phase: 'Write', model: 'sonnet', agentType: 'oh-my-claudecode:writer' })

return { out: OUT, doc, product, claims, planState, thesis, antithesis, attack, synthesis }
