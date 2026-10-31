export const meta = {
  name: 'ux-qa-research-pass',
  description: 'One UX QA + research pass on a guarded test environment: personas, seed, prebake, ui-only and probe lanes with friction capture, metrics, research panel, triage, fix, adversarial review, verdict draft',
  phases: [
    { title: 'Guard', detail: 'identity endpoint proves the target is the test environment' },
    { title: 'Personas', detail: 'design (first pass) or refine from the previous verdict' },
    { title: 'Seed', detail: 'session adapter seeds personas and writes the sessions file' },
    { title: 'Prebake', detail: 'mid-flow fixtures through the real API, marker-tagged' },
    { title: 'Swarm', detail: 'parallel ui-only UX lanes, gold lanes and capability-probe lanes' },
    { title: 'Metrics', detail: 'ux-report: coverage, heatmap, scorecards, gold trend, exit checks' },
    { title: 'Panel', detail: 'parallel research lenses over report, ux.json logs and screenshots' },
    { title: 'Synthesis', detail: 'affinity map, heatmap narrative, heuristics, JTBD gaps, severity' },
    { title: 'Triage', detail: 'confirm against code, decide, partition fix lanes, write ledger.json' },
    { title: 'Fix', detail: 'disjoint fix lanes + integrator (local commits, no push)' },
    { title: 'Review', detail: 'adversarial review that tries to refute, then review fixes' },
    { title: 'Verdict', detail: 'verdict.md draft with exit checks and persona refinement notes' },
  ],
}

// args: see commands/pass.md. Required: pass, passNumber, scenario {slug,name,brief}, study {...}, pluginRoot.
const A = args || {}
const S = A.study || {}
const PASS = A.pass
const N = A.passNumber || 1
const SCEN = A.scenario || { slug: 'general', name: 'general', brief: 'all features' }
const LIB = A.pluginRoot + '/lib'
const P = S.studyDir + '/passes/' + PASS
const MARK = (S.marker || 'uxqa') + '-p' + N
const MODEL_FOR = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' }

const RULES = [
  'PRODUCT: ' + S.product + '. Repo: ' + S.repoRoot + (S.fixRepo && S.fixRepo !== S.repoRoot ? ' (application code in ' + S.fixRepo + ')' : '') + '.',
  'TARGET: the test environment ONLY, ' + S.baseUrl + (A.deployedHash ? ', deployed commit ' + A.deployedHash : '') + '. Guard: ' + S.guardDescription + '. Study bundle: ' + S.studyDir + ' (read study.md first). This pass: ' + P + '.',
  'SCENARIO for this pass: ' + SCEN.name + ' -- ' + SCEN.brief,
  'HARNESS: import { uxSession } from "file:///' + LIB + '/ux-lib.mjs" and { runGold } from "file:///' + LIB + '/gold-tasks.mjs". uxSession({ handle, task, pass: "' + PASS + '", mode, width, locale, slow, keyboardOnly, zoom }) returns { page, step, attempt, workaround, request, trpc, axe, shot, text, outline, finish }. Write flow scripts under ' + P + '/flows/<lane>/ and run them with node from ' + S.repoRoot + ' (Git Bash on Windows: prefix MSYS_NO_PATHCONV=1). Read the png screenshots to judge visual state. Always end a journey with finish(outcome) - COMPLETED | PARTIAL | ABANDONED | BLOCKED - even on error (try/finally).',
  'HARD RULE: never change any environment, service, variable, secret, feature flag, DNS or deployment, and never run deploy/infra CLIs or git push. If the environment is misconfigured, record an OWNER defect and continue.',
  'SAFETY: act only through the UI (ui-only lanes) or the API a real client would call (probe lanes); never touch the database directly; never use another environment; never act on, message or notify a real user; never invite a real email address; never re-mint sessions (report instead). Every piece of content you create carries the marker ' + MARK + '. Never print, log, paste or commit session cookies, storage state, tokens or keys; if a command could echo a secret, reduce its output to a status line.',
  'DEFECTS need: URL, persona, steps, observed vs expected, evidence (screenshot path, ux.json path or response status), severity BLOCKER|HIGH|MEDIUM|LOW. Judge as a demanding product reviewer. Do not invent defects; say when unsure.',
].concat(S.extraRules || []).join('\n')

const UX_DISCIPLINE = [
  'YOU ARE NOT A USER, so act like one on purpose:',
  '- Do not read application source to find selectors, routes or hidden endpoints. Navigate from what is visible: links, buttons, labels, headings. Locate elements by role and visible text.',
  '- Use mode "ui-only". If the UI cannot do it and you fall back to request(), trpc(), a typed URL you only know from source, or anything else a user could not do, call workaround(why) first. Workarounds are HARD friction and the most important signal you produce.',
  '- Wrap each sub-goal in attempt(name, fn). The attempt budget is the persona\'s patience: when it runs out, the persona abandons that sub-goal. Do not keep trying beyond it; record the abandonment and move on.',
  '- Honour your persona constraints exactly: keyboardOnly -> keyboard.press only (Tab, Enter, Space, arrows), no page.click; a11yTreeOnly -> perceive only through outline() and act with getByRole; lowLiteracy -> perceive only through text() and act only on words you can see; zoom/slow/locale/width as given to uxSession.',
  '- Narrate with step(what) in user words. Take shot(name) at every decision point and every surprise. Run axe() once on each new page type.',
].join('\n')

const CONSTRAINTS = { type: 'object', properties: { width: { type: 'number' }, zoom: { type: 'number' }, locale: { type: 'string' }, slow: { type: 'boolean' }, keyboardOnly: { type: 'boolean' }, a11yTreeOnly: { type: 'boolean' }, lowLiteracy: { type: 'boolean' } } }
const PERSONAS_SCHEMA = {
  type: 'object',
  properties: {
    personas: { type: 'array', items: { type: 'object', properties: {
      handle: { type: 'string' }, name: { type: 'string' }, archetype: { type: 'string' }, segment: { type: 'string' },
      goal: { type: 'string', description: 'the outcome this persona drives end to end, in user words' },
      context: { type: 'string', description: 'situation, skills, motivation, what they already know' },
      patience: { type: 'number', description: 'attempt budget for this persona, 1-5' },
      constraints: CONSTRAINTS,
      modelTier: { type: 'string', description: 'haiku | sonnet | opus: the tier that plays this persona' },
      seed: { type: 'object', description: 'adapter-specific seed fields (roles, memberships, profile)' },
    }, required: ['handle', 'name', 'archetype', 'segment', 'goal', 'context', 'patience', 'constraints', 'modelTier', 'seed'] } },
    lanes: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, kind: { type: 'string', description: 'ux | gold | probe' }, personas: { type: 'array', items: { type: 'string' } },
      journey: { type: 'string' }, modelTier: { type: 'string' }, goldTasks: { type: 'array', items: { type: 'string' } },
    }, required: ['name', 'kind', 'personas', 'journey', 'modelTier'] } },
    seed: { type: 'object', description: 'adapter-specific shared fixtures the personas reference (organisations, groups, teams)' },
    retired: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
  required: ['personas', 'lanes', 'seed', 'retired', 'rationale'],
}
const LANE_SCHEMA = {
  type: 'object',
  properties: {
    journeys: { type: 'array', items: { type: 'object', properties: { persona: { type: 'string' }, task: { type: 'string' }, goal: { type: 'string' }, outcome: { type: 'string' }, runDir: { type: 'string' }, workarounds: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['persona', 'task', 'goal', 'outcome', 'runDir', 'workarounds', 'notes'] } },
    defects: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, persona: { type: 'string' }, url: { type: 'string' }, steps: { type: 'string' }, observed: { type: 'string' }, expected: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'title', 'severity', 'persona', 'url', 'steps', 'observed', 'expected', 'evidence'] } },
    priorRecheck: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', description: 'FIXED_LIVE | STILL_BROKEN | NOT_DEPLOYED | CANNOT_CHECK' }, note: { type: 'string' } }, required: ['id', 'status', 'note'] } },
    personaFeedback: { type: 'string', description: 'which personas were unrealistic, missing, too patient, or under-powered for their goal' },
  },
  required: ['journeys', 'defects', 'priorRecheck', 'personaFeedback'],
}
const LENS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      hypothesis: { type: 'string', description: 'a falsifiable statement about users, not a fact' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'ux.json paths, screenshot paths, heatmap rows' },
      routes: { type: 'array', items: { type: 'string' } },
      heuristic: { type: 'string', description: 'Nielsen heuristic number and name, or none' },
      jtbdGap: { type: 'string', description: 'the job the user hired the product for that it fails, or none' },
      impact: { type: 'number', description: '1 annoyance, 2 costly detour, 3 goal failure or harm' },
      frequency: { type: 'number', description: '1 one journey, 2 several, 3 most journeys on that path' },
      segmentBreadth: { type: 'number', description: '1 one constrained segment, 2 several, 3 everyone' },
      confidence: { type: 'string', description: 'low | medium | high' },
      validation: { type: 'string', description: 'how a human session would confirm or kill this' },
    }, required: ['hypothesis', 'evidence', 'routes', 'heuristic', 'jtbdGap', 'impact', 'frequency', 'segmentBreadth', 'confidence', 'validation'] } },
    notes: { type: 'string' },
  },
  required: ['findings', 'notes'],
}
const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    ledger: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, source: { type: 'string', description: 'lane | panel | prior' }, severity: { type: 'string' }, decision: { type: 'string', description: 'FIX | DEFER | NOT_A_BUG | OWNER | DUPLICATE | RESEARCH_QUESTION' }, rootCause: { type: 'string', description: 'file:line confirmed in code, or why none' }, rationale: { type: 'string' }, introducedIn: { type: 'string' }, status: { type: 'string', description: 'OPEN | FIXED | DEFERRED' } }, required: ['id', 'title', 'source', 'severity', 'decision', 'rootCause', 'rationale', 'introducedIn', 'status'] } },
    fixLanes: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, owns: { type: 'array', items: { type: 'string' } }, defectIds: { type: 'array', items: { type: 'string' } }, plan: { type: 'string' } }, required: ['name', 'owns', 'defectIds', 'plan'] } },
  },
  required: ['ledger', 'fixLanes'],
}
const REPORT = { type: 'object', properties: { status: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, notFixed: { type: 'array', items: { type: 'string' } }, files: { type: 'array', items: { type: 'string' } }, commits: { type: 'array', items: { type: 'string' } }, tests: { type: 'string', description: 'exact commands run and their result lines' }, notes: { type: 'string' } }, required: ['status', 'fixed', 'notFixed', 'files', 'commits', 'tests', 'notes'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', description: 'APPROVE | REQUEST_CHANGES' }, findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'fix'] } }, checked: { type: 'array', items: { type: 'string' }, description: 'what you actually verified, with commands' } }, required: ['verdict', 'findings', 'checked'] }

// ---- Guard (a pass that cannot prove its target does nothing else) ----
phase('Guard')
const guard = await agent('Run exactly, from ' + S.repoRoot + ': node "' + LIB + '/guard.mjs"   Report the single output line verbatim and the exit code. Do nothing else. Do not change any configuration if it fails.', { label: 'guard', phase: 'Guard', model: 'haiku' })
if (!guard || !/\bOK\b/.test(String(guard)) || /REFUSED/.test(String(guard))) return { pass: PASS, error: 'guard did not prove the test environment', guard }

// ---- Personas ----
phase('Personas')
const personas = await agent(RULES + '\n' +
  'ROLE: persona ' + (A.priorPass ? 'refiner' : 'designer') + ' for pass ' + PASS + '. Read ' + A.pluginRoot + '/reference/personas.md and follow it. ' +
  (A.priorPass ? 'Refine the cast from ' + S.studyDir + '/passes/' + A.priorPass + '/personas.json using the "Persona refinement" section of ' + S.studyDir + '/passes/' + A.priorPass + '/verdict.md and the coverage gaps in its ux-report.json: keep handles stable for personas that worked, retire the unrealistic, add missing segments, re-power the under-powered. ' : 'Design a cast. ') +
  'Cast size about ' + (A.castSize || 16) + '. Handles follow the adapter rule in study.md. At least a third of the cast is CONSTRAINED (keyboardOnly, a11yTreeOnly, zoom 2, slow network, a non-default locale, lowLiteracy acting only on visible text, 390px width), spread across segments, and modelTier is mixed (haiku plays low-literacy and impatient personas, sonnet most, opus at most two expert personas). ' +
  'Lanes: about ' + (A.laneCount || 6) + ' kind "ux" lanes (2-4 collaborating personas, journeys shaped by the SCENARIO, hand-offs between personas inside one lane), one kind "gold" lane per 3 gold tasks (gold tasks: ' + JSON.stringify(S.goldTasks || []) + '), and ' + (A.probeLanes == null ? 1 : A.probeLanes) + ' kind "probe" lane(s) that check capabilities through the API without counting as UX. ' +
  'WRITE the result as JSON to ' + P + '/personas.json (same shape as your structured answer).', { label: 'personas', phase: 'Personas', schema: PERSONAS_SCHEMA, model: 'opus' })
if (!personas) return { pass: PASS, error: 'persona design failed' }

// ---- Seed ----
phase('Seed')
const seed = await agent('From ' + S.repoRoot + ' run the study session adapter: ' + String(S.adapterSeed).replace('{personas}', P + '/personas.json').replace('{out}', S.sessionsFile) + '   It seeds the personas on the test environment and writes the sessions file. NEVER print, cat, grep or paste the sessions file content: verify it only with node -e that prints the count of entries and the list of handles. If the adapter fails, read only its status line, fix only the persona JSON (handles and seed fields per study.md) and retry up to 3 times. Never edit the adapter, the guard or any configuration. Return seeded handles and missing handles.', { label: 'seed', phase: 'Seed', model: 'sonnet' })

// ---- Prebake ----
phase('Prebake')
const prebake = await agent(RULES + '\n' +
  'ROLE: fixture prebaker for pass ' + PASS + '. Cast and lanes: ' + JSON.stringify(personas) + '\n' +
  'Build scenario-native starting content so lanes can test mid-flow states (half-finished drafts, items awaiting review, populated lists, multi-member groups), acting as the right persona through the real API or UI with uxSession({ mode: "probe", task: "prebake-<n>" }). Discover real endpoints from the product source (probe work may read source; UX lanes may not). Mark everything ' + MARK + '. Write a manifest of everything created (ids, URLs, owners) to ' + P + '/prebake.json and return it. Report anything the product would not let you create as a defect.', { label: 'prebake', phase: 'Prebake', model: 'opus' })

// ---- Swarm (barrier: metrics and triage need every lane) ----
phase('Swarm')
const prior = (A.priorLedger || []).filter((d) => d.decision === 'FIX')
const laneBrief = (l) => {
  const cast = JSON.stringify(personas.personas.filter((p) => l.personas.indexOf(p.handle) >= 0))
  const common = RULES + '\nPASS ' + PASS + ' LANE "' + l.name + '" (kind ' + l.kind + '). Personas: ' + cast + '\nJourney: ' + l.journey + '\nPrebaked fixtures (manifest ' + P + '/prebake.json): ' + String(prebake).slice(0, 5000) + '\nPrior FIX items to re-check if your flows touch them: ' + JSON.stringify(prior) + '\nDefect ids: "p' + N + '-' + l.name + '-<n>". Task ids: "' + l.name + '-<n>".'
  if (l.kind === 'probe') return common + '\nPROBE LANE: uxSession({ mode: "probe" }). You may read source to find endpoints. Check that each capability the scenario needs exists, enforces permissions (try it as a persona who must be denied) and returns sane errors. Probe runs do not count as UX; do not report their effort as friction.'
  if (l.kind === 'gold') return common + '\nGOLD LANE: for each gold task id ' + JSON.stringify(l.goldTasks || []) + ' write a driver and run it with runGold(id, async (s, task) => { ... }, { pass: "' + PASS + '" }). The harness judges success; never call request() or trpc() in a driver. List the tasks with: node "' + LIB + '/gold-tasks.mjs" list\n' + UX_DISCIPLINE
  return common + '\nUX LANE: drive each persona goal end to end through the UI, one uxSession per persona journey, with each persona\'s constraints and attemptBudget = persona.patience.\n' + UX_DISCIPLINE
}
const lanes = await parallel(personas.lanes.map((l) => () => agent(laneBrief(l), { label: 'swarm:' + l.name, phase: 'Swarm', schema: LANE_SCHEMA, model: MODEL_FOR[l.modelTier] || 'sonnet' })))
const ok = lanes.map((r, i) => r && Object.assign({ lane: personas.lanes[i].name, kind: personas.lanes[i].kind }, r)).filter(Boolean)
const defects = ok.flatMap((r) => r.defects)
const stillBroken = ok.flatMap((r) => r.priorRecheck.filter((p) => p.status === 'STILL_BROKEN'))
const journeys = ok.flatMap((r) => r.journeys)
log('swarm: ' + journeys.filter((j) => j.outcome === 'COMPLETED').length + '/' + journeys.length + ' journeys completed, ' + defects.length + ' defects, ' + stillBroken.length + ' prior still broken, ' + (lanes.length - ok.length) + ' lanes failed')

// ---- Metrics ----
phase('Metrics')
const metrics = await agent('From ' + S.repoRoot + ' run exactly: node "' + LIB + '/ux-report.mjs" ' + PASS + '   Return its stdout JSON verbatim. If it fails, return the first error line only. Do not edit any file.', { label: 'metrics', phase: 'Metrics', model: 'haiku' })

// ---- Research panel (parallel lenses; barrier for synthesis) ----
phase('Panel')
const LENSES = [
  ['service-designer', 'Service designer: the end-to-end journey across touchpoints and hand-offs between personas; where the service, not the screen, breaks.'],
  ['accessibility', 'Accessibility specialist: axe rules, keyboard-only and accessibility-tree-only journeys, zoom and slow-network runs; WCAG 2.1 AA success criteria by number.'],
  ['domain-expert', 'Domain expert for ' + S.product + ': whether flows, terms and outputs make sense to a practitioner; wrong defaults and missing domain steps.'],
  ['frontline-worker', 'Frontline worker: the busy, interrupted, repeat user; speed, recoverability, what happens after a mistake, what is re-entered.'],
  ['learning-designer', 'Learning designer: discoverability, onboarding, progressive disclosure, how a new user forms a correct mental model.'],
  ['content-designer', 'Content designer: labels, microcopy, errors, empty states, locale quality, reading level against the low-literacy runs.'],
  ['trust-behavioural', 'Trust and behavioural scientist: perceived risk, consent, privacy cues, dark patterns, defaults, motivation and drop-off points.'],
]
const lensFor = S.lenses && S.lenses.length ? LENSES.filter((l) => S.lenses.indexOf(l[0]) >= 0) : LENSES
const panel = await parallel(lensFor.map((l) => () => agent(
  'ROLE: ' + l[1] + '\nRead ' + A.pluginRoot + '/reference/research-panel.md (method, severity rubric, Nielsen heuristics) and ' + A.pluginRoot + '/reference/friction-metrics.md.\n' +
  'Evidence for pass ' + PASS + ': ' + P + '/ux-report.json (heatmap, tasks, axeRules, goldTrend, coverage), every ' + P + '/runs/*/ux.json (steps, pageEvents, workarounds, attempts, abandoned, errors, axe) and the png screenshots beside them (read the ones your lens needs). trace.zip files are for human replay; do not unzip or publish them. Lane summaries: ' + JSON.stringify(journeys).slice(0, 8000) + '\nMetrics summary: ' + String(metrics).slice(0, 3000) + '\n' +
  'Do not read application source: judge the experience. Every finding is a HYPOTHESIS that cites evidence paths and says how a human session would confirm or kill it. Prefer 5-12 strong findings over many weak ones. Read-only.', { label: 'lens:' + l[0], phase: 'Panel', schema: LENS_SCHEMA, model: 'sonnet' })))
const lensResults = panel.map((r, i) => r && { lens: lensFor[i][0], findings: r.findings, notes: r.notes }).filter(Boolean)

// ---- Synthesis ----
phase('Synthesis')
const synthesis = await agent(
  'ROLE: UX research synthesis lead. Follow ' + A.pluginRoot + '/reference/research-panel.md sec. Synthesis. Inputs: lens findings ' + JSON.stringify(lensResults) + '\nMetrics: ' + P + '/ux-report.json. Scenario: ' + SCEN.name + '.\n' +
  'Write ' + P + '/synthesis.md with YAML frontmatter (type: UX Synthesis, pass: ' + PASS + ', scenario: ' + SCEN.slug + ') and sections: 1 Summary (5 lines), 2 Affinity map (themes -> merged findings, each with its lenses), 3 Friction heatmap narrative (top routes from ux-report heatmap explained in user terms), 4 Heuristic violations (Nielsen, table), 5 JTBD gaps, 6 Findings ranked by severity = impact x frequency x segmentBreadth with the rubric band, 7 Gold tasks and trend, 8 Human validation plan (5 sessions per affected segment, what each session must test), 9 Limits of this evidence (agents are not users). Merge duplicates across lenses; keep disagreements visible. Return the path and the ranked findings as JSON lines.', { label: 'synthesis', phase: 'Synthesis', model: 'opus' })

// ---- Triage ----
phase('Triage')
const triage = await agent(
  'PASS ' + PASS + ' triage for ' + (S.fixRepo || S.repoRoot) + '. Read ' + A.pluginRoot + '/reference/research-panel.md sec. Severity rubric. Confirm EVERY lane defect against the code (file:line) before deciding FIX; be skeptical of by-design or permission-correct states misread as bugs; never remove or degrade a feature. Panel findings (' + P + '/synthesis.md) are hypotheses: FIX only those confirmed in code AND backed by ux.json evidence; otherwise RESEARCH_QUESTION. Lane defects: ' + JSON.stringify(defects) + '\nPrior still broken: ' + JSON.stringify(stillBroken) + '\nSeeded fixes the coordinator requires: ' + JSON.stringify(A.seededFixes || []) + '\n' +
  'Decisions FIX | DEFER (name where it goes) | NOT_A_BUG | OWNER | DUPLICATE | RESEARCH_QUESTION. introducedIn = "' + PASS + '" for new items, the original pass for re-checks. Up to ' + (A.maxFixLanes || 3) + ' fix lanes with DISJOINT file ownership (shared registries, message catalogues and route indexes belong to exactly one lane). BLOCKER > HIGH > MEDIUM; LOW only if trivial. WRITE {"pass":"' + PASS + '","entries":[...ledger]} to ' + P + '/ledger.json. Do not edit application code.', { label: 'triage', phase: 'Triage', schema: TRIAGE_SCHEMA, model: 'opus', agentType: 'general-purpose' })

// ---- Fix / Review (optional: a research-only pass stops after triage) ----
let fixes = null, integ = null, review = null, reviewFix = null
if (A.fix !== false && triage && triage.fixLanes.length) {
  phase('Fix')
  const repo = S.fixRepo || S.repoRoot
  fixes = await parallel(triage.fixLanes.map((f) => () => agent('PASS ' + PASS + ' fix lane "' + f.name + '" in ' + repo + '. You OWN ONLY ' + JSON.stringify(f.owns) + '; other lanes edit the tree concurrently (no git add/commit/stash/checkout/reset, no schema generation or migrations unless you own the schema). Defects: ' + JSON.stringify(triage.ledger.filter((d) => f.defectIds.indexOf(d.id) >= 0)) + '\nPlan: ' + f.plan + '\nFix root causes, never degrade a feature. Add a test through the public seam that fails if the fix is reverted, following the repo test conventions. Typecheck: ' + (S.typecheckCommand || 'the repo typecheck') + ' filtered to your paths. HARD RULE: no environment, variable or deployment changes. Report the exact commands you ran with their result lines.', { label: 'fix:' + f.name, phase: 'Fix', schema: REPORT, model: 'opus', agentType: 'oh-my-claudecode:executor-high' })))
  integ = await agent('PASS ' + PASS + ' integrator in ' + repo + '. Reports: ' + JSON.stringify(fixes) + '\nCheck the diff touches only declared files. Run: tests related to changed files (' + (S.testCommand || 'repo test command') + '), typecheck (' + (S.typecheckCommand || 'repo typecheck') + '), build once (' + (S.buildCommand || 'repo build') + ')' + (S.baseRedFile ? '; compare reds against the known-red baseline ' + S.baseRedFile : '') + '. Commit locally per lane "fix(uxqa-' + PASS + '): <summary> (<ids>)" ending with the attribution trailer the session uses. Do NOT push. Report commit hashes and the exact commands with result lines.', { label: 'integrator', phase: 'Fix', schema: REPORT, model: 'sonnet', agentType: 'oh-my-claudecode:executor' })

  phase('Review')
  review = await agent('Adversarially review the pass ' + PASS + ' commits in ' + repo + ' (' + JSON.stringify(integ && integ.commits) + '). Try to REFUTE: regressions, authorization holes, degraded or removed features, i18n drift, tests that would still pass if the fix were reverted (revert one hunk mentally and check), schema changes without migrations, fixes for defects that were never confirmed in code. APPROVE only what you checked; list what you checked. Never rubber-stamp: if you could not verify, say REQUEST_CHANGES. Read-only.', { label: 'review', phase: 'Review', schema: VERDICT, model: 'opus', agentType: 'oh-my-claudecode:code-reviewer' })
  const must = review ? review.findings.filter((f) => /critical|blocker|high|medium/i.test(f.severity)) : []
  if (must.length) reviewFix = await agent('Fix these review findings on the pass ' + PASS + ' commits in ' + repo + ' with one new local commit "fix(uxqa-' + PASS + '): review findings" (no amend, no push); run the touched tests and report exact commands with result lines. Findings: ' + JSON.stringify(must), { label: 'review-fix', phase: 'Review', schema: REPORT, model: 'opus', agentType: 'oh-my-claudecode:executor-high' })
}

// ---- Verdict draft (the coordinator re-runs every test claim before it becomes final) ----
phase('Verdict')
const verdict = await agent(
  'Write ' + P + '/verdict.md with YAML frontmatter (type: Pass Verdict, pass: ' + PASS + ', scenario: ' + SCEN.slug + ', status: PENDING_COORDINATOR_RERUN). Sections:\n' +
  '1 Exit checks table from ' + P + '/ux-report.json exitChecks (gold success vs target, friction per journey vs previous pass, new HIGH from ' + P + '/ledger.json, route coverage) plus review verdict ' + JSON.stringify(review && review.verdict) + ' and a row "coordinator re-run" left as PENDING.\n' +
  '2 Claims to re-run: every test/typecheck/build command the fix lanes and integrator reported, verbatim, so the coordinator can run them: ' + JSON.stringify({ fixes: fixes && fixes.map((f) => f && f.tests), integ: integ && integ.tests, reviewFix: reviewFix && reviewFix.tests }) + '\n' +
  '3 Ledger summary (counts by decision and severity; FIX items with commits).\n' +
  '4 Persona refinement: from the lanes\' persona feedback ' + JSON.stringify(ok.map((r) => ({ lane: r.lane, feedback: r.personaFeedback }))) + ' and coverage gaps (unvisited routes in ux-report), say which personas to keep, retire, add or re-power next pass and why.\n' +
  '5 Next scenario suggestion.\nPlain, direct prose; no verdict word beyond PENDING. Return the path.', { label: 'verdict', phase: 'Verdict', model: 'sonnet' })

return { pass: PASS, scenario: SCEN, guard, personas, seed, prebake, lanes: ok, metrics, panel: lensResults, synthesis, triage, fixes, integ, review, reviewFix, verdict }
