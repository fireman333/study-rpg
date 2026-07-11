export const meta = {
  name: 'build-remaining-handouts',
  description: 'Build all 8 remaining neurons 考前講義 to BUILD-READY in one parallel run — config → draft → assemble+fact-gate per subject, then ONE global build/verify. Stops at build-ready (no commit / merge / deploy).',
  phases: [
    { title: 'Preflight', detail: 'build dist maps once + confirm the 8 subjects exist in concept-recurrence.json (barrier before fan-out)' },
    { title: 'Config', detail: 'per-subject: extract the config JSON from its arch doc → write <subject>.config.json → node partition-verify (union===canonical, strict) → mine.mjs packets' },
    { title: 'Draft', detail: '~87 Sonnet drafters (1 per subject×region) → each writes fragments/<subject>/<regionId>.html from its packet + arch-doc region guidance + exemplar contract' },
    { title: 'FactGate', detail: 'per-subject: assemble.mjs → Codex adversarial review → for EACH finding: 考選部 packet-grep + OpenEvidence tiebreak → keep 考選部-aligned (⚠️國際教科書 note) / fix ONLY genuine errors → re-assemble' },
    { title: 'GlobalBuild', detail: 'ONCE after ALL subjects (barrier): register SUBJECT_META + verify-handout assertions (single agent, shared files) → build:handout + copy-content + verify:handout + typecheck + test → build-ready summary' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Subjects. order = SUBJECT_META display order (解剖學0 / 組織學1 / 胚胎學2 already
// taken → new subjects continue 3..10). expectedLeaves / regions are sanity hints
// only; the authoritative partition check reads the LIVE canonical count from
// dist/concept-recurrence.json (field: leafId). Region list per subject is produced
// by the Config stage (from mine.mjs), NOT hardcoded here.
// ─────────────────────────────────────────────────────────────────────────────
const SUBJECTS = [
  { id: '生理學', order: 3, expectedLeaves: 71, regions: 12, tier: '9 full / 3 brief · 全11科最大 fan-out 之一' },
  { id: '藥理學', order: 4, expectedLeaves: 67, regions: 17, tier: '14 full / 3 brief · 最大 region fan-out（17）' },
  { id: '病理學', order: 5, expectedLeaves: 65, regions: 14, tier: '9 full / 5 brief' },
  { id: '寄生蟲學', order: 6, expectedLeaves: 21, regions: 6, tier: '6 full / 0 brief · 全 full' },
  { id: '微生物學', order: 7, expectedLeaves: 51, regions: 10, tier: '7 full / 3 brief · 51 leaves → 10 regions（V2 拆分）' },
  { id: '生物化學', order: 8, expectedLeaves: 74, regions: 13, tier: '9 full / 4 brief · leaf 數最大（74）' },
  { id: '公共衛生學', order: 9, expectedLeaves: 42, regions: 8, tier: '6 full / 2 brief' },
  { id: '免疫學', order: 10, expectedLeaves: 30, regions: 7, tier: '6 full / 1 brief' },
]

const REPO = '/Users/kangweiling/coding-scratch/study-rpg-neurons'
const PKG = 'packages/content-neurons-tw'
const HP = `${PKG}/scripts/handout-pipeline`

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────
const PREFLIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['distReady', 'perSubjectLeafCount', 'missingSubjects'],
  properties: {
    distReady: { type: 'boolean', description: 'true iff the content build succeeded AND all 8 subjects have ≥1 canonical leaf in dist/concept-recurrence.json' },
    perSubjectLeafCount: { type: 'object', description: 'subjectId → live canonical leaf count', additionalProperties: { type: 'number' } },
    missingSubjects: { type: 'array', items: { type: 'string' }, description: 'subjects with 0 leaves in dist (should be empty)' },
    buildLog: { type: 'string', description: 'last ~15 lines of the content build output' },
  },
}

const CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'canonicalLeaves', 'assignedLeaves', 'partitionOk', 'regionCount', 'regions', 'packetsWritten'],
  properties: {
    subject: { type: 'string' },
    canonicalLeaves: { type: 'number', description: 'live canonical count from concept-recurrence.json' },
    assignedLeaves: { type: 'number', description: 'union size of all region leafIds (must equal canonicalLeaves)' },
    partitionOk: { type: 'boolean', description: 'true iff strict partition: no dup / no missing / no extra / unique===canonical' },
    regionCount: { type: 'number' },
    fullCount: { type: 'number' },
    briefCount: { type: 'number' },
    regions: {
      type: 'array',
      description: 'ordered regions from the written config + mine packet (drives the Draft fan-out)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['regionId', 'title', 'targetDepth', 'leafCount'],
        properties: {
          regionId: { type: 'string', description: 'hdt- ASCII kebab === HTML .hdt-region id' },
          title: { type: 'string' },
          targetDepth: { type: 'string', enum: ['full', 'brief'] },
          leafCount: { type: 'number' },
          poolSize: { type: 'number', description: 'question pool size from mine packet' },
        },
      },
    },
    packetsWritten: { type: 'boolean', description: 'mine.mjs wrote packets/<subject>.packets.json' },
    error: { type: 'string' },
  },
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'regionId', 'wroteOk', 'fragmentPath'],
  properties: {
    subject: { type: 'string' },
    regionId: { type: 'string' },
    fragmentPath: { type: 'string' },
    wroteOk: { type: 'boolean' },
    targetDepth: { type: 'string', enum: ['full', 'brief'] },
    topicCount: { type: 'number', description: 'number of .hdt-topic blocks authored' },
    tableCount: { type: 'number', description: 'number of .hdt-tbl tables authored' },
    uncertainFacts: { type: 'array', items: { type: 'string' }, description: 'facts the drafter could not fully ground in the packet (for the fact-gate to double-check)' },
    note: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'assembledOk', 'reAssembledOk', 'codexFindingCount', 'keptExamAligned', 'genuineFixes'],
  properties: {
    subject: { type: 'string' },
    assembledOk: { type: 'boolean', description: 'first assemble.mjs (structure lint) passed' },
    reAssembledOk: { type: 'boolean', description: 'assemble.mjs after corrections passed' },
    codexFindingCount: { type: 'number' },
    keptExamAligned: { type: 'number', description: 'findings KEPT because they are 考選部 official answers (⚠️國際教科書 note added)' },
    genuineFixes: { type: 'number', description: 'findings that were genuine drafter errors/embellishments and were fixed' },
    intlNotesAdded: { type: 'number', description: 'count of <span class="hdt-intl">⚠️國際教科書…</span> notes inserted' },
    fragmentsEdited: { type: 'array', items: { type: 'string' } },
    unresolved: { type: 'array', items: { type: 'string' }, description: 'findings the OE/packet gate could not resolve — surfaced for owner review' },
    note: { type: 'string' },
  },
}

const GLOBALBUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subjectsRegistered', 'handoutSubjectCount', 'verifyHandoutPass', 'typecheckPass', 'testPass'],
  properties: {
    subjectsRegistered: { type: 'array', items: { type: 'string' } },
    handoutSubjectCount: { type: 'number', description: 'subjects in dist/handout.json after build:handout (should be 3 shipped + newly-built)' },
    perSubjectQuizCount: { type: 'object', additionalProperties: { type: 'number' }, description: 'subjectId → 區測驗 count in handout.json' },
    copyContentOk: { type: 'boolean' },
    verifyHandoutPass: { type: 'boolean' },
    typecheckPass: { type: 'boolean' },
    testPass: { type: 'boolean' },
    testSummary: { type: 'string', description: 'e.g. "138 files / 1130 tests green"' },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prompt fragments
// ─────────────────────────────────────────────────────────────────────────────
const CWD = `cwd: ${REPO} (git branch track-neurons). Traditional Chinese content domain (台灣醫師國考一階).`

const TEMPLATE_CONTRACT = `## Fragment template contract (LOCKED by 組織學/胚胎學 — assemble.mjs loud-fails on any violation)
Read BOTH exemplars before writing:
- \`${HP}/_exemplar-region.html\` (canonical shape)
- \`${HP}/fragments/組織學/hdt-cell-basics.html\` (a shipped, fact-graded region)

Required structure (every region, full OR brief):
- ONE \`<section class="hdt-region" id="<regionId>">\` — the \`id\` MUST equal your regionId EXACTLY (bidirectional id-drift guard).
- \`<h2 class="hdt-region__head">…</h2>\` (emoji + region title + 一行主軸)
- \`<p class="hdt-intro">…</p>\` — 導言 (REQUIRED by lint): why this region, the study skeleton, ROI framing. No 命中率/保證 slang.
- one or more \`<div class="hdt-topic"> <h3>主題（English）</h3> <p class="hdt-teach">…</p> <ul class="hdt-must"> <li>…<b>關鍵</b>…<cite>年份</cite></li> </ul> </div>\`
  - \`.hdt-must\` (必背重點, REQUIRED by lint) — each \`<li>\` a self-contained 考點, bold the discriminator, \`<cite>\` the exam years the point maps to (from the packet questions).
- at least ONE \`<table class="hdt-tbl hdt-struct">\` (教學表格, REQUIRED by lint) with a \`<h3 class="hdt-h">🔑 …</h3>\` heading — the X-vs-Y / anchor comparison table(s).

BANNED slang (assemble + build both loud-fail): 命中率, 保證會考, 保證命中, 必中, 必考, 今年一定考, 100%命中, 包中.`

const HONESTY_AND_FACT = `## Honesty + fact rules (考選部-primary — the project's hard rule)
- Ground EVERY claim in your packet: use the question stems / answers / \`optionExplanations\` / \`explanation\` that mine.mjs put in your packet. Micro/immuno/parasite corpora are already 100% 考選部-sourced + 100% grounded — cite, don't re-derive.
- Numbers, directions (機制方向), and X↔Y pairings are the LLM failure hotspots. Do NOT invent values or flip a direction. If the packet does not pin a number/direction, either omit it or list it in \`uncertainFacts\` so the fact-gate double-checks it — never guess.
- 考選部 answer key WINS over international textbooks. If you know an international textbook says something different, still write the 考選部-aligned fact; the fact-gate will attach the ⚠️國際教科書 note. Do NOT "correct" the corpus toward Langman/Moore/Robbins/Katzung.`

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT
// ─────────────────────────────────────────────────────────────────────────────
const preflightPrompt = () => `You are the preflight step for the "build all 8 remaining 考前講義" pipeline. ${CWD}

The downstream pipeline reads \`${PKG}/dist/{questions,concept-recurrence,concept-tags}.json\` (mine.mjs) — make sure they are FRESH and COMPLETE before ~87 drafter agents fan out.

Do exactly this:
1. Run the content build once (regenerates all dist maps; idempotent, writes only dist/ + handout.json from the 3 already-shipped subjects):
   \`pnpm --filter @study-rpg/content-neurons-tw build\`
   Capture the tail of the output. If it exits non-zero, set distReady=false and put the error in buildLog.
2. Confirm all 8 subjects have canonical leaves in the rebuilt map:
   \`node -e 'const r=require("./${PKG}/dist/concept-recurrence.json");const S=["生理學","藥理學","病理學","寄生蟲學","微生物學","生物化學","公共衛生學","免疫學"];const o={};for(const s of S)o[s]=r.concepts.filter(c=>c.subjectId===s).length;console.log(JSON.stringify(o))'\`
   Expected counts (sanity): 生理71 藥理67 病理65 寄生21 微生51 生化74 公衛42 免疫30. A subject with 0 leaves ⇒ add it to missingSubjects and set distReady=false.
3. Confirm the pipeline scripts + exemplars exist: \`ls ${HP}/{mine.mjs,assemble.mjs,_exemplar-region.html}\` and \`ls docs/handout-architectures/\` (8 arch docs).

Return PREFLIGHT_SCHEMA. distReady=true ONLY if the build succeeded, all 8 subjects have >0 leaves, and the scripts/docs exist. Do NOT author any config or content.`

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG (stage 1)
// ─────────────────────────────────────────────────────────────────────────────
const configPrompt = (s) => `You are the config author for subject 「${s.id}」 in the "build all 8 remaining 考前講義" pipeline. ${CWD}

The architecture is ALREADY DESIGNED — your job is to transcribe it faithfully and verify the partition, NOT to redesign it. Expected: ~${s.expectedLeaves} canonical leaves → ${s.regions} regions (${s.tier}).

Do exactly this:
1. Read \`docs/handout-architectures/${s.id}.md\` fully. Find the FINAL region-array JSON under the "## 分區" heading — a \`\`\`json block that is an array of \`{ regionId, title, targetDepth, leafIds[] }\`. (If the doc shows a superseded cut, always take the FINAL one that the doc's own "node partition check" section validates.)
2. Write that JSON array VERBATIM to \`${PKG}/${s.id}.config.json\` (pretty-printed, 2-space). Contract (locked by 組織學/胚胎學): \`regionId\` = \`hdt-\`-prefix ASCII kebab, no CJK, unique, === the HTML .hdt-region id; \`title\` = CJK display; \`leafIds\` = EXACT canonical ids from concept-recurrence.json (verbatim); \`targetDepth\` ∈ {'full','brief'}.
3. Node-verify STRICT PARTITION (field name is \`leafId\`):
   \`node -e 'const fs=require("fs");const S="${s.id}";const cfg=JSON.parse(fs.readFileSync("${PKG}/"+S+".config.json","utf8"));const rec=require("./${PKG}/dist/concept-recurrence.json");const canon=new Set(rec.concepts.filter(c=>c.subjectId===S).map(c=>c.leafId));const asg=cfg.flatMap(r=>r.leafIds);const uniq=new Set(asg);const dup=asg.filter((x,i)=>asg.indexOf(x)!==i);const missing=[...canon].filter(l=>!uniq.has(l));const extra=[...uniq].filter(l=>!canon.has(l));console.log(JSON.stringify({canon:canon.size,assigned:asg.length,unique:uniq.size,dup,missing,extra,partitionOk:!dup.length&&!missing.length&&!extra.length&&uniq.size===canon.size},null,1))'\`
   partitionOk MUST be true (union === canonical, 0 dup / 0 missing / 0 extra). If false: the JSON was mis-transcribed — re-read the doc and fix the leafIds, do NOT invent a partition. Also assert every regionId is hdt- ASCII and every targetDepth ∈ {full,brief}.
4. Create the fragments dir for the drafters: \`mkdir -p ${HP}/fragments/${s.id}\`.
5. Mine per-region packets: \`node ${HP}/mine.mjs ${s.id}\` → writes \`${HP}/packets/${s.id}.packets.json\`. Confirm it wrote one packet per region, each non-empty (≥1 leaf, ≥1 question). The union pool MAY exceed the subject total (multi-tag overlap) — that's expected.

Return CONFIG_SCHEMA. \`regions\` = the ordered regions with regionId/title/targetDepth/leafCount(+poolSize from the mine output). This list drives the drafter fan-out, so it must exactly match the written config. Set partitionOk / packetsWritten honestly; if either fails, put the reason in \`error\` and still return the partial data. Touch ONLY \`${s.id}.config.json\` + the fragments dir + packets — do NOT edit any shared TS file, do NOT author HTML.`

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT (stage 2 — nested parallel over regions)
// ─────────────────────────────────────────────────────────────────────────────
const draftPrompt = (s, r) => `You are a Sonnet drafter authoring ONE region of the 「${s.id}」 考前講義. ${CWD}

Your region: \`${r.regionId}\` — 「${r.title}」 · targetDepth = **${r.targetDepth}** · ${r.leafCount} leaves${r.poolSize ? ` · ~${r.poolSize} 題 pool` : ''}.

## Inputs (read all before writing)
1. Your packet: open \`${HP}/packets/${s.id}.packets.json\`, find the entry whose \`regionId === "${r.regionId}"\`. It has \`leaves[]\` (breadth-desc, high-yield first) + \`questions[]\` (stem/options/answer/optionExplanations/explanation/regionLeaves, breadth-ordered). This is your grounding — teach exactly these leaves, at the depth the packet's questions actually test.
2. Your region's SPECIFIC authoring guidance: read \`docs/handout-architectures/${s.id}.md\` and extract the guidance for THIS region from 〈深度策略〉, 〈考點筆記〉, 〈事實嚴謹熱點〉, and the gate-A drafter note — e.g. leaf-level 壓縮 for named tail leaves (write those brief-式, one line, no mechanism prose), sub-split 縫 for big regions (author two sub-headed 半場, unchanged leaf partition), must-ship anchor tables (e.g. 三型肌肉 / O2-Hb / 凝血 / 酸鹼四象限 — every cell correct), and this subject's fact-rigor hotspots.
3. ${TEMPLATE_CONTRACT}

${HONESTY_AND_FACT}

## Depth
- **full** → complete teaching: 導言 + per-topic 教學散文(.hdt-teach) + 必背(.hdt-must) + anchor tables. Honor any leaf-level 壓縮 note (some leaves inside a full region are authored brief-式 per the arch doc — do NOT expand them to full length or you blow the one-week budget).
- **brief** → concise: a short 導言 + tight 必背 + discriminator/anchor TABLES only, minimal teach prose. BUT you STILL MUST emit \`.hdt-intro\` + \`.hdt-must\` + ≥1 \`.hdt-tbl\` (assemble lint requires all three regardless of depth) — brief means less prose, never a missing structural block. (Note: brief is first-shipped by this batch — err toward complete discriminator tables.)

## Write
Write your fragment to \`${HP}/fragments/${s.id}/${r.regionId}.html\` (mkdir -p the dir if missing). It must contain EXACTLY ONE \`.hdt-region\` section with \`id="${r.regionId}"\`. Do not wrap it in <html>/<body>. Do not touch any other file.

Return DRAFT_SCHEMA (wroteOk, topicCount, tableCount, and any \`uncertainFacts\` you could not fully ground — the fact-gate will verify those against 考選部 + OpenEvidence).`

// ─────────────────────────────────────────────────────────────────────────────
// FACTGATE (stage 3) — hop 1: Codex assemble + adversarial review
// ─────────────────────────────────────────────────────────────────────────────
const codexReviewPrompt = (s, cfg) => `Drive the Codex CLI to adversarially fact-review the assembled 「${s.id}」 考前講義. ${CWD}
Run Codex through the shared runtime: \`cd ${REPO} && codex exec -m gpt-5.6-terra --skip-git-repo-check "<PROMPT>" < /dev/null\` (fall back to \`-m gpt-5.5\` on a 400 model error; on TooManyRequests report it and stop — do NOT retry more than once; never let Codex silently draw a fake result).

Steps:
1. First ASSEMBLE (deterministic; you have Bash): \`node ${HP}/assemble.mjs ${s.id}\`. This concatenates the ${cfg && cfg.regionCount ? cfg.regionCount : s.regions} region fragments into \`${PKG}/src/handout/${s.id}.html\` and runs the structure lint. If it FAILS (missing .hdt-intro/.hdt-must/.hdt-tbl, id drift, stray/missing fragment, banned slang), report the exact lint error verbatim and STOP — the fragments are malformed and must be re-drafted before any fact review.
2. If assemble passed, feed Codex the assembled \`${PKG}/src/handout/${s.id}.html\` together with the grounding \`${HP}/packets/${s.id}.packets.json\`, and have it hunt for CANDIDATE factual errors: wrong numbers, flipped 機制方向, mis-paired X↔Y, wrong receptor/ion-channel/germ-layer/enzyme, malformation/timing errors, over-broad claims. For EACH candidate Codex must state: the region, the exact sentence/table cell, why it looks wrong, and Codex's proposed correction + severity (HIGH/MED/LOW).

Return Codex's full per-finding list as text (region → offending text → why → proposed fix → severity), PLUS whether assemble passed. Do NOT edit any file — you are review-only. IMPORTANT context for the next step: Codex does NOT know the 考選部 answer key, so a Codex "HIGH error" is frequently the official exam answer diverging from an international textbook — the next agent will adjudicate; your job is only to surface candidates completely.`

// FACTGATE hop 2: two-pronged 考選部-packet + OpenEvidence gate, apply corrections, re-assemble
const gatePrompt = (s, cfg, codexFindings) => `You are the fact-gate adjudicator for the 「${s.id}」 考前講義 — the single most important quality step. ${CWD}

Codex has produced candidate error findings (below). Codex does NOT know the 考選部 answer key. In the embryology worked example, ~11 of 21 Codex "HIGH errors" were actually 考選部 OFFICIAL ANSWERS that diverge from Langman/Moore — blind-applying Codex would have shipped exam-WRONG answers. So you must run a TWO-PRONGED gate on EVERY finding, never rubber-stamp Codex.

## Codex findings
${typeof codexFindings === 'string' ? codexFindings.slice(0, 14000) : JSON.stringify(codexFindings).slice(0, 14000)}

## For EACH Codex finding, adjudicate:
1. **Prong A — 考選部 packet grep** (authoritative): search \`${HP}/packets/${s.id}.packets.json\` for the question(s) behind this claim — check the \`answer\`, \`optionExplanations\`, and \`explanation\` (these are 考選部 詳解 原文, already grounded). Is the drafter's statement the OFFICIAL exam answer, or a drafter embellishment/hallucination not in the corpus?
   - Also grep the raw corpus if needed: \`${PKG}/data/medexam-reconciled/questions.json\`.
2. **Prong B — OpenEvidence tiebreak**: load the OE tools via ToolSearch (\`select:mcp__openevidence__oe_ask,mcp__openevidence__oe_article_get\`) and \`oe_ask\` the specific mechanism/number/pairing to see whether it is genuinely wrong vs merely textbook-divergent. Use this to CLASSIFY, not to override 考選部.

## Decision rule (non-negotiable)
- Finding matches the 考選部 official answer (Prong A) → **KEEP the fact unchanged**. If (and only if) an international textbook genuinely diverges, append a note INSIDE that li/cell: \`<span class="hdt-intl">⚠️ 國際教科書：<短句></span>\`. Never change a 考選部-aligned fact.
- Finding is a genuine drafter error/embellishment NOT supported by the corpus (Prong A shows the corpus says otherwise, or Prong B confirms a real error) → **FIX it** in the fragment.
- Genuinely ambiguous after both prongs → leave the drafter text, add it to \`unresolved\` for owner review; do NOT guess.

## Apply + re-assemble
Edit the affected fragment files under \`${HP}/fragments/${s.id}/<regionId>.html\` (each finding maps to one region). Keep edits surgical — only the flagged sentence/cell + any ⚠️國際教科書 note. Do NOT touch other subjects' files, shared TS, config, or schema. Then re-run \`node ${HP}/assemble.mjs ${s.id}\` to regenerate \`${PKG}/src/handout/${s.id}.html\` and re-pass the structure lint.

Return GATE_SCHEMA with honest counts: codexFindingCount, keptExamAligned (kept because 考選部-official), genuineFixes, intlNotesAdded, fragmentsEdited, unresolved, and reAssembledOk (assemble passed after your edits). ${cfg && cfg.regionCount ? `Expected ${cfg.regionCount} regions in the assembled file.` : ''}`

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALBUILD (single agent, AFTER the per-subject pipeline barrier)
// ─────────────────────────────────────────────────────────────────────────────
const globalBuildPrompt = (readySubjects) => `You are the GLOBAL build+verify step — run ONCE, only after ALL 8 subjects finished their per-subject assemble+fact-gate. ${CWD}
\`build:handout\` reads EVERY committed \`${PKG}/src/handout/*.html\` into a SINGLE \`dist/handout.json\`, so it (and verify/typecheck/test) MUST run exactly once here, never per-subject.

Subjects that reached build-ready this run (register ONLY these; skip any that failed):
${readySubjects.map((r) => `- ${r.subject} (SUBJECT_META order ${r.order}, ${r.regionCount} regions)`).join('\n')}

Do exactly this, in order:
1. **Register subjects — two SHARED files, edit them HERE and only HERE (avoids the multi-agent staging race):**
   a. \`${PKG}/scripts/build-handout.ts\` → in the \`SUBJECT_META\` object add one line per subject above, mirroring the existing 解剖學/組織學/胚胎學 entries: \`'<subject>': { order: <order>, title: '<subject> 考前講義' },\`. No build-branch change — the region-keyed path routes on \`existsSync(<subject>.config.json)\` and is already generic.
   b. \`${PKG}/scripts/verify-handout.ts\` Part 2 (built-output check) → add, per subject, an assertion symmetric to the existing 組織學 one: subject present in handout.json; its 區測驗 entry count === that subject's regionCount; every entry \`memberRegionIds.length === 1\`; every entry \`sourceQuestionIds.length > 0\`. Leave the 解剖學/組織學/胚胎學 assertions and Part 1 (synthetic contract-violation tests) untouched.
2. **Global build:** \`pnpm --filter @study-rpg/content-neurons-tw build:handout\` → confirm dist/handout.json now carries the 3 shipped + the newly-built subjects, each with its region 測驗 count.
3. **Copy content:** \`node apps/neurons-tw/scripts/copy-content.mjs\` → handout.json copied into \`apps/neurons-tw/public/content/neurons-tw/\`.
4. **Verify contract:** \`pnpm --filter @study-rpg/content-neurons-tw verify:handout\` → must PASS (all subjects guarded; Part 1 contract-violation tests still throw).
5. **Typecheck:** \`pnpm -r typecheck\` → clean.
6. **Test:** \`pnpm --filter @study-rpg/neurons-tw test\` → green, no regression vs prior count.

Guardrails: this is BUILD-READY only — do NOT git commit, do NOT merge track-neurons→main, do NOT deploy, do NOT touch Dexie \`.version()\` / R2 \`SCHEMA_VERSION\` / \`SYNCED_META_KEYS\` / sync engine / CF Pages allowlist (this feature is content-only). If any step fails, capture the exact error in \`issues\` and still report which steps passed — do not paper over a failure.

Return GLOBALBUILD_SCHEMA.`

// ─────────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────────
phase('Preflight')
const pre = await agent(preflightPrompt(), { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT_SCHEMA })
if (!pre || !pre.distReady) {
  log(`✗ preflight failed — aborting before fan-out. missing: ${pre ? JSON.stringify(pre.missingSubjects) : 'null'}`)
  return { aborted: true, reason: 'preflight distReady=false', preflight: pre }
}
log(`✓ preflight ok — dist fresh; leaf counts ${JSON.stringify(pre.perSubjectLeafCount)}`)

// Per-subject pipeline: Config → Draft → FactGate. No cross-subject barrier — a small
// subject (寄生6) can be fact-gating while a big one (藥理17) is still drafting; this also
// SPREADS the 8 Codex calls over time instead of bunching them (rate-limit friendly).
const perSubject = await pipeline(
  SUBJECTS,

  // Stage 1 — Config (writes <subject>.config.json + packets; disjoint per subject → parallel-safe)
  (s) => agent(configPrompt(s), { label: `config:${s.id}`, phase: 'Config', schema: CONFIG_SCHEMA }),

  // Stage 2 — Draft: nested parallel over this subject's regions (fragments are disjoint files → parallel-safe)
  (cfg, s) => {
    if (!cfg || !cfg.partitionOk || !cfg.regions || cfg.regions.length === 0) {
      log(`✗ ${s.id}: config/partition failed (partitionOk=${cfg && cfg.partitionOk}) — skipping draft`)
      return { cfg, drafts: [] }
    }
    log(`▶ ${s.id}: drafting ${cfg.regions.length} regions (${cfg.fullCount ?? '?'} full / ${cfg.briefCount ?? '?'} brief)`)
    return parallel(
      cfg.regions.map((r) => () =>
        agent(draftPrompt(s, r), { label: `draft:${s.id}/${r.regionId}`, phase: 'Draft', model: 'sonnet', schema: DRAFT_SCHEMA }),
      ),
    ).then((drafts) => ({ cfg, drafts: (drafts || []).filter(Boolean) }))
  },

  // Stage 3 — Assemble + two-pronged Fact-Gate (Codex adversarial + 考選部 packet + OpenEvidence)
  async (prev, s) => {
    if (!prev || !prev.cfg || !prev.drafts || prev.drafts.length === 0) {
      return { subject: s.id, cfg: prev && prev.cfg, gate: null, skipped: true }
    }
    const { cfg, drafts } = prev
    const wrote = drafts.filter((d) => d && d.wroteOk).length
    if (wrote !== cfg.regionCount) log(`⚠ ${s.id}: ${wrote}/${cfg.regionCount} fragments written`)
    // hop 1: Codex assembles + adversarially reviews (Bash-only codex-rescue agent)
    const codex = await agent(codexReviewPrompt(s, cfg), { label: `codex:${s.id}`, phase: 'FactGate', agentType: 'codex:codex-rescue' })
    // hop 2: Opus adjudicates each finding (考選部 packet + OE), applies surgical fixes, re-assembles
    const gate = await agent(gatePrompt(s, cfg, codex), { label: `gate:${s.id}`, phase: 'FactGate', model: 'opus', schema: GATE_SCHEMA })
    log(`✓ ${s.id}: fact-gate — ${gate && gate.keptExamAligned} kept 考選部 / ${gate && gate.genuineFixes} fixed / reassemble ${gate && gate.reAssembledOk}`)
    return { subject: s.id, cfg, gate }
  },
)

// Barrier reached: every subject flowed through all 3 stages. Global build ONCE.
const ready = perSubject
  .filter((x) => x && x.cfg && x.gate && x.gate.reAssembledOk)
  .map((x) => ({ subject: x.subject, order: (SUBJECTS.find((s) => s.id === x.subject) || {}).order, regionCount: x.cfg.regionCount }))
log(`${ready.length}/${SUBJECTS.length} subjects reached build-ready HTML: ${ready.map((r) => r.subject).join(', ') || '(none)'}`)

phase('GlobalBuild')
const build = ready.length
  ? await agent(globalBuildPrompt(ready), { label: 'global-build', phase: 'GlobalBuild', model: 'opus', schema: GLOBALBUILD_SCHEMA })
  : null
if (!build) log('✗ no subjects reached build-ready — skipped global build')

return {
  aborted: false,
  subjectsAttempted: SUBJECTS.map((s) => s.id),
  buildReady: ready.map((r) => r.subject),
  perSubject: perSubject.filter(Boolean).map((x) => ({
    subject: x.subject || (x.cfg && x.cfg.subject),
    regions: x.cfg && x.cfg.regionCount,
    partitionOk: x.cfg && x.cfg.partitionOk,
    keptExamAligned: x.gate && x.gate.keptExamAligned,
    genuineFixes: x.gate && x.gate.genuineFixes,
    reAssembledOk: x.gate && x.gate.reAssembledOk,
    unresolved: (x.gate && x.gate.unresolved) || [],
  })),
  globalBuild: build,
  note: 'BUILD-READY only — no commit / merge / deploy. Owner reviews handout HTML + fact-gate notes, runs dev-browser QA (esp. first-shipped brief regions), then ships via the normal archive→merge(=CF deploy) gate.',
}
