# 2026-06-08 — Connectome rework: 突觸傳導 (conduction) + 5-change roadmap

Owner-locked direction for the gameplay connectome (Hebbian 連線) rework, converged over
5 Codex (gpt-5.5) rounds + 3 owner decision rounds this session. Supersedes the original
zero-numeric cut of `rework-neurons-connectome-expedition-driven` (which was drafted but
never applied). Source consult logs: `/tmp/connectome-codex-out{1..5}.txt`;
grill: `~/.claude/scratch/grilled-神經元突觸最終方案-connectome-2026-06-08.md`.

## Core mechanic (locked)

**Trigger** — connectome wires form/strengthen from **expedition co-repair** ("repair
together, wire together"), evaluated at expedition settlement (`onExpeditionComplete`),
NOT per answer:
- A "repair" = a `lastResult==='wrong'` question answered correctly (flip) **inside an
  expedition session**. Normal/random/per-subject quiz flips do NOT count. 年份回數遠征
  (full-paper exam) does NOT count.
- Per-day per-subject repair count accumulated; subject is "repaired today" at **K=2**.
- **Effective-completion gate**: pairs are only processed on a day with an *effective
  expedition completion* (= ≥5 total repairs that day, or clear-all-if-pool<5 AND ≥2).
  This is the SAME daily bar as the streak, so wiring feels earned, not trivially cheap.
- ≥2 subjects repaired-today → candidate pairs; process at most **DAILY_PAIR_CAP=3**/day,
  priority: new pair > weak→strong candidate > longest since last co-repair > higher
  (repairCountA × repairCountB).

**State machine** — `dormant → weak → strong`; advance when both subjects re-qualify as
repaired-today on a LATER day than the wire's last co-repair date; ≤1 level/day; strong
re-repair just refreshes the date.

**Decay** — **7-day soft** window (kept at the existing 7, NOT 14 — game is a ~2-month
play-through, so 7 keeps "use it or it weakens" meaningful; missing 2–3 days must not feel
like failure). >7 days without co-repair → drop one level (strong→weak→dormant), never
removed; decay sets date to today (no cascading).

**Streak** — daily effective-completion streak + **weekly 本週 X/7** framing (so one missed
day doesn't emotionally zero the system). No energy/speed/numeric bonus from the streak.

## The bonus — 突觸傳導 (Synaptic Conduction) — REPLACES the invisible `synapseBonus`

The old `economy.ts` `synapseBonus` (each strong synapse self-multiplies a family's accrual
+6%, cap +30%) was the "invisible % nobody notices". REMOVE it; replace with a VISIBLE,
ADDITIVE, capped cross-flow:

| Param | Value |
|---|---|
| Rate (on source family's POST-multiplier earned energy, per batch) | dormant 0% / weak **6%** / strong **12%** |
| Batching unit | expedition settlement + reading-session end (NOT per-answer, NO daily sweep) |
| Rounding / min pulse | `floor(batch × rate)`; `<1` → suppress (no energy, no pulse); `≥1` → grant + pulse; UI numeric label only `≥2` |
| Per-wire/day cap | weak 8 / strong 15 energy |
| Per-source-family/day cap | 45 energy (outgoing) |
| Per-target-family/day cap | 30 energy (incoming) |
| Properties | one-hop only (no chaining); does NOT strengthen wires; does NOT count as co-repair; NOT scaled by target's own multipliers |

**Felt calibration** (vs real constants `CORRECT_ANSWER_ENERGY=3`, `nodeCost≈11–33`): a strong
wire usually hits its 15/day cap ≈ ~1 early variant; a fully-unstudied subject is capped at
30/day incoming ≈ 1–2 early pulls → only "keeps neighbors warm", can't complete a subject.
Worst case (6 strong wires maxed) ≈ 90 energy/day network-wide, still a perk not a shortcut
because conduction can't strengthen wires + 7-day decay forces real study. **Rate governs
"is it felt"; caps govern "economy ceiling".** Newbie-safe: no wire = baseline, never a
penalty; first weak wire is a pleasant surprise. All numbers dogfood-tunable.

## Wire-benefit legibility (in change #1)

1. **Settlement conduction ledger** (highest impact): `突觸傳導：藥理 → 解剖 +12 能量｜今日連線額外獲得 +27`.
2. **Per-wire tooltip**: source/target/rate/today's cap (`讀藥理/修藥理錯題 → 解剖 +12%，今日 12/15`).
3. **About-to-wire ghost line** in the 錯題出征 subject picker: `再修復 X 題即可形成連線`.

## Legacy synapses (from the removed same-day-co-fire trigger)

Keep + label **早期連線 / historical** (thinner, grey-blue); **exclude from the「穩定連線數」
narrative stat** until re-validated by a new expedition co-repair (derive via
`lastCoFireDate` vs a ship-epoch constant — zero schema). Never wiped.

## Other juice (change #1)

Repair spark → pulse traveling the wire (unified with the conduction pulse); daily-completion
ritual already in proposal; honest empty states.

## Zero-schema discipline (change #1)

No Dexie `.version()` bump. Daily accumulators + streak + conduction caps go via `meta` keys
(date-keyed for daily ones; streak/lastCompleteDate into `SYNCED_META_KEYS`). Existing
`db.synapses` table reused. Per-day conduction cap accumulators are within-day ephemeral
(date-keyed; need not sync). Confirm `pnpm lint:dexie-fixtures` not triggered.

## 5-change ship order (owner-locked)

| # | Change id | Scope | Depends on |
|---|---|---|---|
| 1 | `rework-neurons-connectome-expedition-driven` (**revise existing**) | trigger→expedition+K+gate, 7-day decay, weekly streak, legacy-historical, **synaptic conduction** bonus, wire-legibility 3-piece, daily-completion ritual | foundation |
| 2 | `split-neurons-expedition-exam-modes` (new) | UI/IA split: 入口①錯題出征 (建立連線) vs 入口②百題模考 (不產生連線, exam-room visual) | do right after #1 (else tutorial rewrites) |
| 3 | `add-neurons-connector-neuron-family` (new) | **連結神經元**: each unique subject pair's FIRST strong-wire unlocks ONE unique connector (closed set = 11C2 = **55**, NOT a gacha pool, NOT a 12th subject family — a *bridge class*: split-color frame of the two subject colors, bridge/axon silhouette, synaptic glow). Dexie bump + sprites + unlock + collection-page section. Neuro framing = association/interneuron circuit-bridging — **OE/PubMed-verify before locking copy**; avoid "interneurons connect all regions" over-generalization. | needs #1 wiring; high-risk, after core dogfood |
| 4 | `enhance-neurons-share-cards` (new) | shareable unit → freshly-pulled rare variant + (after #3) connector unlock card; demote brain-scan stats card to weekly/milestone background | variant part early; connector part needs #3 |
| 5 | `update-neurons-onboarding-connectome` (new) | one tutorial pass teaching the FINAL loop incl. connectors (Codex's v1+v2 collapsed into one — solo dogfood, owner is primary user) | last (teach shipped mechanic) |

## Rejected / superseded

- **Owner's "lost-path" idea** (unwired neuron gets lost → longer route): rejected. Penalty
  framing punishes new/sparse-pool players who can't wire yet; "getting-lost unlocks more
  variants" creates a perverse "don't-wire-for-loot" incentive; requires maze-topology
  change (another dev's domain). Its kernel ("make wiring felt / change the maze") is
  delivered instead by visible conduction pulses + the connector collectible.
- **Per-subject myelination as a 2nd economy bonus**: rejected (muddies "am I chasing
  mastery or connectome"). Conduction-only.
- **Zero-numeric connectome** (original proposal D3): superseded by conduction (owner wants
  real felt teeth, not pure cosmetic).
- **K=3 / 14-day decay / 21-day decay**: superseded by K=2+gate / 7-day.
