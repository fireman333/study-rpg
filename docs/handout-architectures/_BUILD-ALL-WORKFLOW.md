# Build-all Workflow — 8 remaining 考前講義 in one parallel run

> Script: [`scripts/handout-pipeline/build-remaining-handouts.workflow.js`](../../scripts/handout-pipeline/build-remaining-handouts.workflow.js)
> Designed by Fable (2026-07-11). This doc explains the phase structure, agent fan-out, the global-build barrier, the fact-gate encoding, and exactly how a later session runs it. **The workflow stops at BUILD-READY — it never commits, merges, or deploys.**

## What it produces

One run takes the 8 remaining subjects from their (already-designed) arch docs to **build-ready**: each subject gets a committed `packages/content-neurons-tw/<subject>.config.json` + `src/handout/<subject>.html`, registered in `SUBJECT_META` + `verify-handout.ts`, with `build:handout` + `copy-content` + `verify:handout` + `pnpm -r typecheck` + neurons test all green. A human then reviews the HTML + fact-gate notes, runs dev-browser QA, and ships via the normal `archive → merge track-neurons→main (= CF Pages deploy)` gate.

The 8 subjects (region cut + depth already locked in each `docs/handout-architectures/<subject>.md`):

| # | Subject | Regions (drafters) | full / brief | Canonical leaves |
|---|---|---:|---|---:|
| 1 | 生理學 | 12 | 9 / 3 | 71 |
| 2 | 藥理學 | 17 | 14 / 3 | 67 |
| 3 | 病理學 | 14 | 9 / 5 | 65 |
| 4 | 寄生蟲學 | 6 | 6 / 0 | 21 |
| 5 | 微生物學 | 10 | 7 / 3 | 51 (→10 regions, V2 split) |
| 6 | 生物化學 | 13 | 9 / 4 | 74 |
| 7 | 公共衛生學 | 8 | 6 / 2 | 42 |
| 8 | 免疫學 | 7 | 6 / 1 | 30 |
| | **Total** | **87** | **66 / 21** | **421** |

## Phase structure (one line each)

1. **Preflight** (1 agent, awaited barrier) — `pnpm --filter @study-rpg/content-neurons-tw build` to refresh all `dist/*.json`, confirm all 8 subjects have >0 canonical leaves + scripts/exemplars exist; aborts the whole run if `distReady=false` (never fan out onto a stale/broken corpus).
2. **Config** (pipeline stage 1, 8 agents, parallel-safe) — each reads its arch doc, transcribes the `## 分區` JSON verbatim to `<subject>.config.json`, node-verifies **strict leaf partition** (`union === canonical`, 0 dup/missing/extra, field `leafId`), `mkdir -p fragments/<subject>`, runs `mine.mjs <subject>` → per-region packets. Returns the region list that drives the drafter fan-out.
3. **Draft** (pipeline stage 2, ~87 Sonnet agents) — nested `parallel` over each subject's regions; each drafter reads its packet + its region's guidance from the arch doc (leaf-level 壓縮 / sub-split 縫 / must-ship anchor tables / fact hotspots) + the exemplar contract + honesty rules, writes `fragments/<subject>/<regionId>.html` (disjoint files → parallel-safe).
4. **FactGate** (pipeline stage 3, 2 agents/subject = 16) — hop 1: a **`codex:codex-rescue`** agent runs `assemble.mjs` (structure-lint) then adversarially reviews the assembled HTML against the packet; hop 2: an **Opus** agent runs the two-pronged 考選部+OE gate (below), applies surgical fixes, re-assembles.
5. **GlobalBuild** (1 agent, after the pipeline barrier) — registers only the subjects that reached build-ready in `SUBJECT_META` + `verify-handout.ts` (both shared files edited by this ONE agent), then `build:handout` → `copy-content` → `verify:handout` → `pnpm -r typecheck` → neurons `test`.

Pipeline (not a global barrier) for stages 2–4: a small subject (寄生6) can be fact-gating while a big one (藥理17) is still drafting, which also **spreads the 8 Codex calls over time** instead of bunching them at a barrier (rate-limit friendly). The only hard barrier is `await pipeline(...)` resolving before GlobalBuild.

## Why the global build is a barrier (the load-bearing dependency)

`build:handout` (`scripts/build-handout.ts`) does `readdirSync(src/handout/).filter(.html)` → assembles **one** `dist/handout.json` from **all** committed handout HTML. `copy-content`, `verify:handout`, `typecheck`, and `test` are likewise whole-repo. Running any of them per-subject in parallel would race the single `handout.json` output and the shared `SUBJECT_META` / `verify-handout.ts` edits. So config/mine/draft/assemble/fact-gate are per-subject parallel (disjoint files), but the build layer runs **exactly once, after every subject's HTML is assembled** — enforced by putting it after the `await pipeline(...)` barrier. The two shared TS files are edited by the single GlobalBuild agent (not the 8 config agents), sidestepping the multi-agent staging race entirely.

## Fact-gate encoding (the biggest lesson — do NOT rubber-stamp Codex)

In the embryology worked example, **~11 of 21 Codex "HIGH errors" were actually 考選部 official answers** diverging from Langman/Moore — blind-applying Codex would have shipped exam-WRONG answers. The gate is therefore two-pronged, per finding:

- **Prong A — 考選部 packet grep (authoritative):** search the region packet's `answer` / `optionExplanations` / `explanation` (考選部 詳解 原文, already grounded) — is the drafter's claim the official exam answer or a drafter embellishment?
- **Prong B — OpenEvidence tiebreak:** `oe_ask` (loaded via `ToolSearch select:mcp__openevidence__oe_ask,mcp__openevidence__oe_article_get`) to classify genuinely-wrong vs merely-textbook-divergent.

Decision rule: 考選部-aligned → **KEEP**, and if an international textbook genuinely diverges, add `<span class="hdt-intl">⚠️ 國際教科書：…</span>` inside that li/cell. Genuine drafter error unsupported by the corpus → **FIX**. Ambiguous after both prongs → leave text, list in `unresolved` for owner review. Codex runs review-only (no edits); the Opus agent owns all edits + the re-assemble. The gate returns honest counts (`keptExamAligned` / `genuineFixes` / `intlNotesAdded` / `unresolved`).

## Agent-count estimate

| Phase | Agents |
|---|---:|
| Preflight | 1 |
| Config | 8 |
| Draft (Sonnet) | 87 |
| FactGate — Codex review (`codex:codex-rescue`) | 8 |
| FactGate — Opus gate + edits | 8 |
| GlobalBuild | 1 |
| **Total** | **~113** |

Concurrency cap = `min(16, cores-2)` ≈ 10–16 concurrent, so the 87 drafters run in ~6–9 waves; the pipeline serializes naturally under the cap (that's fine and expected). Draft = Sonnet; FactGate adjudication + GlobalBuild = Opus; Codex review via the shared runtime.

## Cost / wall estimate

- **Draft** dominates: ~87 Sonnet drafters. Under a ~12-wide cap that's ~7 waves; per-subject arch docs estimated ~20–45 min wall for their own fan-out, so the whole batch is plausibly **~1.5–3 h wall**, gated mostly by the drafter waves + the 8 sequential-per-subject Codex calls.
- **Token budget** is heavy (87 drafters each reading a packet + arch-doc + 2 exemplars, then 16 fact-gate hops). This exceeds the 燒錢 gate A threshold (>10 subagents, wall >30 min) — **quote the owner once up front** (≈113 agents, Sonnet draft + Opus/Codex/OE gate) before launching; per autonomy_charter §3 gate A the owner approves the batch size once, then it runs unattended.

## Risks (owner should know before running)

1. **🔴 Huge fan-out amplifies any systematic drafter error.** 87 independent drafters means a shared bad habit (e.g. inventing RMP values, flipping 機制方向) appears in many regions. The fact-gate catches it per subject, but if the corpus grounding is thin for a leaf, `uncertainFacts` / `unresolved` must be read by the owner — the gate is honest about what it couldn't resolve, it does not silently "fix."
2. **Codex rate-limit (`TooManyRequests`).** 8 Codex calls; the pipeline spreads them (small subjects finish first), and each Codex invocation is instructed to retry at most once then report+stop (no fake-image/fake-result). If Codex is exhausted mid-run, that subject's fact-gate degrades to packet-grep-only — surfaced in `unresolved`, not silently skipped.
3. **OpenEvidence volume.** The fact-rigor-heavy subjects (生理 12 hotspots, 微生 divergence-heavy, 病理 criteria) will issue many `oe_ask` calls. Acceptable, but the OE MCP must be authed; if it isn't, Prong B is unavailable and the gate falls back to Prong A (考選部 packet) alone — still safe (考選部 is authoritative), just less international-divergence annotation.
4. **First-shipped `brief` regions (21 of them).** No subject has shipped a `brief` region yet (組織學/胚胎學 all `full`). `brief` is **not a separate code path** — `build-handout` doesn't branch on `targetDepth`, and `assemble.mjs` requires `.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl` regardless — so it's structurally safe. The risk is purely content-quality (a brief drafter dropping a required block → loud assemble-lint fail, or over-thinning a discriminator table). The drafter prompt hard-requires all three structural blocks for brief; the owner should still give the 21 brief regions extra eyeball in dev-browser QA.
5. **Partition mis-transcription.** A config agent could fat-finger a leafId. Mitigated by the mandatory node partition check (`partitionOk` must be true, or the subject is dropped from the draft fan-out and reported) — a broken partition never reaches drafting.

## How the later session runs it

```
Workflow({ scriptPath: "scripts/handout-pipeline/build-remaining-handouts.workflow.js" })
```

No edits needed — the script is self-contained. Before launching, give the owner the gate-A quote (~113 agents; Sonnet draft + Opus/Codex/OE fact-gate; ~1.5–3 h wall) and get the one-time batch approval. On completion the return value gives, per subject: region count, `partitionOk`, `keptExamAligned` / `genuineFixes`, `reAssembledOk`, and any `unresolved` findings; plus the GlobalBuild result (handout subject count, verify/typecheck/test pass). Then the owner:

1. Reviews each `src/handout/<subject>.html` + the fact-gate `unresolved` list (especially the fact-rigor hotspots per arch doc).
2. Runs dev-browser QA (`preview_start` → subject picker shows all subjects, each 測驗本區 opens a non-empty pool, the 21 brief regions render, console clean, SPA three-piece).
3. Ships via `/opsx:archive` → commit → **merge track-neurons→main (= CF Pages deploy, owner-gated)** → prod verify at `med-study-rpg.com/neurons/cram/handout`.

The workflow deliberately stops before step 1 — everything after is the human 對外發布 gate.
