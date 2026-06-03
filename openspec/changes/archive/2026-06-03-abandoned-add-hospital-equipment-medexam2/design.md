## Context

Three observations drive this design:

1. **Endgame revenue overflow**: per `hospital-finances` D5 math check, `國家級教學醫院` default-config net revenue is `+167/min ≈ 240k/day`. Existing sinks (facility upgrade max 1M, room extension caps, training, retirement refund inverts to +) all plateau by ~mid-game. Revenue accumulates with no meaningful spend.
2. **Fate card cost gate**: 命運卡 (1k / 10k / 100k / 1M reputation) is the sole reputation sink. Owner reports cards feel underwhelming relative to cost, especially the legendary 1M cost.
3. **T4 gate is one-dimensional past diversification**: once a player has 10 P2+ subjects + 1 P1 doctor + 150k reputation (current threshold per `clinic-tiers.ts`), T4 unlocks. No "capital investment" gate gives the top tier appropriate weight, AND owner reports the 150k reputation threshold is too low — endgame arrives in ~2 weeks vs the 30-day target the original calibration aimed for.

Equipment addresses (1) and (3) directly. It does NOT replace fate cards as the reputation sink (per owner direction). A separate follow-up change MAY introduce equipment-donation as a low-probability fate-card reward to address (2).

## Goals / Non-Goals

**Goals:**
- 10 named equipment items with 3-level upgrade ladder each = 30 distinct revenue sinks of progressive size (~500k to ~60M range)
- Two passive multipliers per equipment level: reputation gain rate + patient throughput (forever)
- Multipliers stack additively across owned equipment levels (simple math, predictable scaling)
- T4 upgrade gains a new gate: 3 unique equipment installed (any level) — single-axis, not nested
- All equipment purchasable at any tier — no tier-locked equipment (matches owner's "T1 can buy CT" preference)
- Image generation deferred to apply phase, via Gemini per `~/.claude/imports/image_gen_routing.md` (32×32 or 48×48 pixel-art, 16-color, chroma-key + nearest-neighbor postprocess)

**Non-Goals:**
- Equipment maintenance cost (no recurring "monthly maintenance fee" — adds bookkeeping for marginal design value)
- Specialty-specific equipment affinity (e.g., 達文西 only benefits 外科 doctors) — could be added in a follow-up, but adds combinatorial complexity for the initial ship
- Equipment as a fate-card reward (deferred to `add-fate-card-equipment-donation-reward` follow-up change)
- Animation / sprite-overlay on Hospital scene — equipment exists abstractly, not visually placed in rooms. UI is a card-grid panel. Sprite layer can be added later.
- Random equipment "breakdown" events requiring repair revenue — out of scope; adds RNG to a system designed to feel deterministic / capital-investment
- Per-room equipment (different rooms have different equipment) — equipment is hospital-wide; everyone benefits

## Decisions

### D1: Equipment catalog — 10 items with 3 levels each

The 10 equipment items (locked, no future additions without a new change):

| ID | Display name (zh) | Real-world reference | L1 cost (revenue) | L2 cost | L3 cost |
|---|---|---|---|---|---|
| `ct` | 電腦斷層 (CT) | 64-slice → 256-slice → photon-counting | 800,000 | 3,000,000 | 10,000,000 |
| `mri` | 磁振造影 (MRI) | 1.5T → 3T → 7T research-grade | 2,000,000 | 8,000,000 | 25,000,000 |
| `endoscopy` | 內視鏡系統 | SD → HD + AI → capsule + ESD | 500,000 | 2,000,000 | 6,000,000 |
| `davinci` | 達文西手術機器人 | Si → Xi → SP single-port | 5,000,000 | 20,000,000 | 60,000,000 |
| `cathlab` | 心導管室 (DSA) | single-plane → biplane → hybrid 4D | 1,500,000 | 5,000,000 | 15,000,000 |
| `petct` | 正子斷層 (PET-CT) | 18F-FDG → multi-tracer → total-body | 4,000,000 | 12,000,000 | 35,000,000 |
| `linac` | 直線加速器 (LINAC) | conventional → VMAT → proton beam | 3,000,000 | 10,000,000 | 30,000,000 |
| `ecmo` | 體外膜氧合 (ECMO) | single unit → multi-unit → mobile team | 500,000 | 1,500,000 | 5,000,000 |
| `hybridor` | 複合式手術房 | basic → image-guided → AI-augmented | 6,000,000 | 20,000,000 | 50,000,000 |
| `ngs` | 次世代定序儀 (NGS) | desktop → production → long-read cluster | 1,000,000 | 3,000,000 | 8,000,000 |

Total "buy all L1": 24.3M revenue (~7 days at 國家級 default + active play). Total "buy all L3": 244M revenue (~6 weeks dedicated grind). The L3 ceiling deliberately exceeds typical 30-day endgame target so completionists have a long-tail.

Alternative considered: tier-gating individual equipment (e.g., 達文西 needs T3). Rejected — owner prefers free purchase at any tier; player progression is naturally gated by revenue, not artificial tier locks.

### D2: Multiplier formula — additive within axis, multiplicative across systems

Each equipment level grants additive bonuses to two multipliers:

| Level | Reputation gain bonus | Throughput bonus |
|---|---|---|
| L1 | +1% | +2% |
| L2 | +3% cumulative | +5% cumulative |
| L3 | +7% cumulative | +12% cumulative |

(Cumulative = L2 owner gets the +3% / +5%, not +1+3% / +2+5%. Owning L3 gives +7% / +12% replacing the lower levels' values.)

Final multipliers:

```
reputationGainRate = Σ over owned equipment[bonus[level]]   (e.g., 5 L3 + 5 L1 = 5×7% + 5×1% = +40%)
throughputRate     = Σ over owned equipment[bonus[level]]   (e.g., same = 5×12% + 5×2% = +70%)
```

Throughput formula becomes: `baseRate × powerMultiplier × roomFacility × affinityBonus × (1 + throughputRate)`

Reputation accrual at any path (quiz reward, reading session reputation, mock exam, mentor) becomes: `baseReputation × (1 + reputationGainRate)`

Alternative considered: multiplicative within axis (1.01 × 1.03 × 1.07 × ...). Rejected — additive is more predictable for players and avoids runaway compound multipliers (owning 10 L3 would give ~×1.97 multiplier vs additive +70%).

### D3: Reputation multiplier does NOT bypass fate card cost gate

The reputation multiplier amplifies the *rate* at which reputation is earned through active play (quiz / reading / mentor / mock exam). It does NOT generate reputation from idle / AFK gameplay. So:

- A T4 player with 10 L3 equipment AFK for 24 hours: reputation does NOT grow
- The same player doing 1 hour of quiz with 10 L3 equipment: reputation grows ~70% faster than the same hour without equipment

This means equipment shortens the "time to grind 1M reputation for legendary 命運卡" but doesn't replace the grind. The cost-gate strategic tension stays intact.

Alternative considered: "passive reputation income" mechanic where equipment generates +N reputation/minute even idle. Rejected — would directly bypass the fate card cost gate and turn equipment into an idle reputation pump (defeats the whole "active play" identity of the game).

### D4: T4 equipment gate — 3 unique equipment installed (any level)

The `醫學中心 → 國家級教學醫院` upgrade SHALL require: in addition to the existing dual-gate (reputation 300k per D9 + 10 P2+ subjects + 1 P1), the player SHALL own ≥ 3 distinct equipment IDs at L1 or higher. "Owning at L0" (never purchased) does NOT count.

Why 3 (not 5, not 1):
- 5 is too many — total L1 cost for any 5 would be ~6.5M revenue, multi-weeks of grind even at 國家級-default income
- 1 is too lax — owner emphasized T4 should feel like a "real capital investment milestone"
- 3 = roughly 1.5–2.5M revenue at cheapest L1 picks (ECMO L1 500k + endoscopy L1 500k + CT L1 800k = 1.8M, or 3× ECMO L1 = 1.5M). At 醫學中心 default net revenue (~5k/day under reading sessions), this is **~10–15 days of revenue grind** — the equipment gate is intentionally the slowest of the three T4 gates, becoming the typical final-arriving lock. Reputation (300k) takes ~30 days from 醫學中心 unlock at the typical rate, so reputation is usually done before equipment is.

The 3 equipment can be at any level (L1 / L2 / L3) — the gate counts unique IDs, not total upgrades.

Existing T4 players (those who upgraded BEFORE this change ships at the old 150k threshold) are grandfathered: tier monotonicity per `clinic-level-up` Requirement 1 guarantees no tier regression, even if their saved tier value is T4 with 0 equipment and reputation < 300k.

Alternative considered: requires CT + 1 任選 + 1 任選 (1 specific + 2 任). Rejected — pins player's strategy and reduces meaningful choice. Pure "3 unique" lets player optimize for their playstyle.

### D5: Image generation in apply phase — Gemini-first, codex fallback

Per `~/.claude/imports/image_gen_routing.md`: simple icon-style sprites for a UI card grid favor Gemini MCP (`mcp__gemini__gemini_generate_image`) — ~5s/image, parallel-callable, ~30× faster than codex.

Spec: 10 equipment sprites, 48×48 pixel art, 16-color quantize, transparent background (post-processed via `magick` chroma-key + nearest-neighbor downsample). Pixel-art style: GBA-era, slight outline, frontal view, easily recognizable silhouette.

If Gemini result for a specific item underwhelms after 2 rerolls (e.g., 達文西 robot has complex multi-arm geometry that Gemini struggles with), fall back to codex CLI `gpt-image-2` for that single item per `~/.claude/imports/codex_image_gen.md` setup.

Image generation does NOT happen during this design phase — it happens in apply (task 5.x in tasks.md).

**Update 2026-05-23 (apply phase reality)**: Gemini MCP image gen was unavailable during the apply phase window (auth/region error at the time of sprite generation). All 10 equipment sprites generated via **codex CLI primary path** (per `codex_image_gen.md` recipe with `--skip-git-repo-check --sandbox workspace-write -C /tmp`) + `magick` postprocess to 384×384 + 16-color quantize + transparent corner key. Quality acceptable (see tasks 5.1–5.3 [x] notes). Gemini-first rule kept above for future equipment additions when Gemini is restored; current apply just routed everything to codex.

### D6: Dexie schema — new table `hospitalEquipment`

Schema row shape:

```ts
interface OwnedEquipmentRow {
  equipmentId: EquipmentId         // PK, one of the 10 enum strings
  level: 1 | 2 | 3                 // current installed level
  purchasedAt: number              // Unix ms, first purchase (L1)
  upgradedAt: number               // Unix ms, last upgrade timestamp
  updatedAt: number                // LWW timestamp for sync
}
```

Dexie schema_version bump: **v15 → v16**. v15 was claimed by `add-achievement-system` (commit `9bf1f5e`, 2026-05-23 Phase 5) for the local-only `achievements` table; equipment uses v16 to avoid version collision. Migration step is no-op — `hospitalEquipment` starts empty for everyone (no existing data to migrate). Storage cost: 10 rows × ~80 bytes = 800 bytes max per save.

R2 bundle inclusion: `m2-snapshot.json.gz` schema_version bumps 1 → 2; old clients reading new bundles ignore the unknown `hospitalEquipment` key. New clients reading old bundles treat missing key as empty array. Forward-compatible by construction.

### D7: UI placement — Hospital page card grid section

`HospitalPage.tsx` gains a new collapsible section `「設備」` below the existing room roster + room extension UI. Section contains a card grid (responsive: 2 col on mobile, 5 col on desktop) rendering all 10 equipment cards. Each card shows:

- Equipment sprite (48×48)
- Display name (zh)
- Current level chip (L0 / L1 / L2 / L3, where L0 = not owned)
- Bonus breakdown: `+X% 聲望增益` / `+Y% 病患吞吐`
- Next-level cost button (or "已達最高等級" when L3)

Tapping the next-level button opens a confirmation modal with the cost + projected new bonus values. Confirm deducts revenue, writes to `hospitalEquipment` table, recomputes hospital-wide multipliers on next tick.

Default collapse state: section is expanded by default for players at T2+ (likely interested in spending revenue), collapsed at T1 (encourage focus on basic loops first). Players can toggle either way.

### D8: Naming conventions

- Capability: `hospital-equipment` (kebab-case, matches existing `hospital-*` pattern)
- Dexie table: `hospitalEquipment` (camelCase, matches `hospitalDoctors` / `hospitalMastery` / `hospitalQuestionHistory`)
- Catalog file: `packages/content-medexam2-tw/src/equipment-catalog.ts`
- Helper module: `apps/medexam2-hospital-tw/src/lib/equipment.ts`
- Type names: `EquipmentId` / `EquipmentDef` / `OwnedEquipmentRow`

### D9: T4 reputation threshold bump — 150k → 300k

Concurrent with the equipment gate (D4), the `TIER_UPGRADE_THRESHOLDS.醫學中心` literal in `packages/content-medexam2-tw/src/clinic-tiers.ts` SHALL change from `150_000` to `300_000`. This is the reputation required to advance from `醫學中心` to `國家級教學醫院`.

**Why bundled with equipment (not a separate change)**:
- Both modifications affect the same T4 upgrade gate semantically — they form a coordinated "T4 recalibration" event.
- HelpMenu copy update needs both pieces simultaneously — splitting would force two sequential copy edits.

**Math justification — why 300k (not 150k current, not higher)**:

Verified daily reputation rate at typical play (2026-05-23 audit):
- `QUIZ_REPUTATION_PER_CORRECT_BASE = 80` × tierMultiplier × specialtyMultiplier × (optional reading buff 1.5×)
- 醫學中心 tier: 80 × 1.6 × 1.0 = 128 rep/correct, or 192 with reading buff
- Typical play (27 min/day × ~1.8 correct/min) → ~5,000 rep/day on average across ramp

Days-to-reach for various threshold options:

| Target | 0 equipment | Mid-game eq (+14%) | Late-game eq (+38%) | Full L3 eq (+70%) |
|---|---|---|---|---|
| 300k (chosen) | ~60 days | ~52 days | ~43 days | ~37 days |
| 500k | ~100 days | ~88 days | ~72 days | ~59 days |
| 1M | ~200 days | ~175 days | ~145 days | ~118 days |
| 1.5M (rejected) | ~300 days | ~263 days | ~217 days | ~177 days |

Owner picked 300k for "~1-month endgame phase" — that is, 30 days from 醫學中心 unlock (reputation 80k) to T4 (300k) under typical play, which matches the「不要太快結束」request without pushing players into 6-month grinds. The 1.5M originally proposed was rejected after math review showed it required 5–9 months of typical play, risking player attrition.

**Why NOT bump quiz base reward** (`QUIZ_REPUTATION_PER_CORRECT_BASE` from 80):
- Owner decision: keep base reward formula unchanged; rely on threshold + equipment multiplier to control pacing
- Equipment multiplier (D2) already provides 0–70% acceleration over the journey
- Bumping base would cascade into revenue economy (same constant pattern) and require re-evaluation of facility / room extension / fate card costs — out of scope

**Why NOT touch 30k (診所) and 80k (區域醫院)**:
- Players have already crossed these thresholds — bumping would not affect them (tier monotonicity).
- But potential new players starting fresh would see significantly different early-game pacing. Owner specifically said don't change.
- Early-game gates feel about right; recalibration is needed only at the endgame (T4) where the "nothing left to do" problem manifests.

**Why NOT change `國家級教學醫院: null`**:
- Terminal tier has no upgrade target. The `null` value signals "no further upgrade possible". Unchanged.

**Backfill behavior**:
- Pre-existing T4 saves: grandfathered, no regression (tier monotonicity per Requirement 1).
- T3 saves with reputation already > 150k but < 300k: keep their accumulated reputation, just continue grinding to 300k. No clawback.
- T3 saves with reputation < 150k: face the new 300k threshold + 3 equipment gate — effectively a 2× longer T4 vs the original calibration plus a new revenue-grind axis. Owner accepts this as the desired rebalance.

**Tuning flag**: the literal SHALL gain a new tuned-date comment: `// TUNED 2026-05-23 — T4 threshold bumped 150k → 300k alongside equipment gate; revisit after 2-week telemetry`.

## Risks / Trade-offs

[Risk] Adding the T4 equipment gate AND bumping T4 reputation threshold simultaneously surprises mid-build T3 players actively saving toward T4 (they planned around 150k reputation with no equipment, now face 300k + 3 equipment — effectively 2× harder T4 + new revenue-grind axis).
→ Mitigation: HelpMenu copy clearly surfaces both new T4 conditions. V6MigrationModal (or a fresh equipment-system intro modal) explains the recalibration to existing T3 saves with copy「T4 升級門檻已從 150k 提高到 300k 聲望 + 安裝 3 種設備，給遊戲多一個月的後期目標」. Equipment is cheap enough at L1 that even a T3 player one minute from old-T4 can grind ~2 weeks extra revenue + buy 3 cheapest L1. Owner explicitly opted into this rebalance — endgame previously felt too short. T3 players who already accumulated > 150k reputation in expectation of T4 keep that reputation (no clawback); they just need to keep grinding toward 300k AND build out 3 equipment.

[Risk] Bundle schema_version bump 1 → 2 in parallel with `add-r2-cloud-sync-migration` could create conflict if equipment ships during the R2 dual-write window (Supabase mirror has no equipment column → silent data loss for early dual-write players).
→ Mitigation: equipment change SHALL NOT apply until R2 Phase 3 (R2-only reads + writes) completes. Coordinate via `add-r2-cloud-sync-migration` archive timing.

[Risk] Multiplier inflation — 10 L3 equipment gives +70% reputation gain, which compounded with weekly streaks + study buffs could push endgame XP/rep gain beyond intended pacing.
→ Mitigation: D2 deliberately uses additive (not multiplicative) stacking. +70% feels powerful but is bounded. Owner can tune the level bonuses in a follow-up if telemetry shows runaway pacing.

[Risk] Player buys L1 equipment immediately at T1 and over-invests revenue before unlocking room extension at T2 (region tier).
→ Mitigation: equipment cards show "建議：先升 T2 解鎖房間擴建" hint when current tier is T1. Owner accepts this as a player-choice tradeoff; no hard tier-lock per design D1.

[Risk] Image generation in apply phase blocks ship — Gemini API key not configured, codex CLI out of quota, image gen fails for half the items.
→ Mitigation: apply tasks include a fallback "ship without sprites" path where each equipment renders a placeholder emoji ([🏥] for CT, [🧲] MRI, etc.) so the change can ship while sprite gen is retried. Sprite hotswap is a low-risk follow-up.

[Risk] 10 equipment items × 3 levels = 30 catalog rows; tuning revenue costs takes 3-5 dogfood passes.
→ Mitigation: `// TUNED 2026-05-23 — first design pass; revisit after dogfood telemetry` flag on the cost literals per existing convention.

## Migration Plan

1. **Dexie schema bump v15 → v16** — add `hospitalEquipment` store with `equipmentId` as primary key. Empty for everyone. No data migration step needed. (v15 owned by `add-achievement-system`.)
2. **R2 bundle schema_version bump 1 → 2** — `bundles.ts` `m2Bundle` snapshot includes new `hospitalEquipment` array key. Forward-compatible: missing key in old bundles = empty array on read.
3. **Catalog ship** — `equipment-catalog.ts` exports the 10 frozen definitions. No version flag needed; catalog is content data, not engine schema.
4. **UI ship** — EquipmentPanel mounts on Hospital page. Initially empty for everyone, players opt in by purchasing.
5. **T4 gate enforcement** — `clinic-level-up` tick code reads `hospitalEquipment` table count when evaluating T4 upgrade gate. Pre-shipped T4 players grandfathered (no regression). Players at T3 actively saving for T4 see the new gate immediately.
6. **Image gen apply tasks** — sprites generated via Gemini batch, postprocessed via `magick`, committed to `apps/medexam2-hospital-tw/src/assets/sprites/equipment/<id>.png`.

**Rollback**: revert all 4 specs and code changes. Dexie schema v16 → v15 NOT automatic — players who upgraded retain v16 schema but never see the equipment table (no UI to render it). Acceptable for a revert scenario; players can clear local data if they need to "downgrade".

## Open Questions

- Q: Should equipment ownership influence which doctors / fate-card rewards the player receives (e.g., owning 達文西 → +X% chance of 外科 doctor pulls)? → No, deferred. Adds combinatorial complexity. Can be a follow-up change.
- Q: Should equipment be visible in the leaderboard (5th attribute beyond hospital_tier / reputation / doctor_count / total_study_min / total_correct)? → No, deferred. Leaderboard schema is mid-flux per `add-hospital-leaderboard-correct-count-filter`. Add equipment leaderboard column in a follow-up if dogfood telemetry shows player demand.
- Q: Should equipment grant a small SRS / mastery bonus (e.g., owning NGS sequencer → 內科 SRS interval +5%)? → No, deferred. Out of scope; muddies the design clarity of "equipment = passive multipliers".
