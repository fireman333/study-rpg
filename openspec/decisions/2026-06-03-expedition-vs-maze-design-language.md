# Decision — 出征 (expedition) vs maze 探索：設計語言 + reward 歸屬 (2026-06-03)

> Canonical framing for how the all-subject wrong-question **出征** relates to the
> **maze** exploration mechanic, and where the 出征 completion reward belongs.
> Locked now (owner-confirmed); the **reward implementation is deferred to #3 /
> Phase 4** (`add-neurons-expedition-rewards`) — see "Deferral" below. #3
> `promote-maze-to-home` and the future expedition-rewards change SHALL inherit this.

## Three things share 小隊 / 旅程 language — only two are mechanics

| | What | Axis | Player action |
|---|---|---|---|
| **maze 探索** (`neurons-brain-maze`, `/maze-beta`) | MECHANIC: energy (any correct answer + reading) advances the branch frontier → reaching a fogged node settles = **mint a NEW variant** | 能量軸 (forward / acquire) | spend energy to explore + grow new neurons |
| **出征 · 全科錯題** (`neurons-study-squad` Req "All-subject wrong-question expedition"; `lib/services/expedition.ts`) | MECHANIC: `⚔️ 出征` opens `QuizModal` on the cross-subject `questionHistory.lastResult === 'wrong'` pool | 精通軸 (backward / remediate) | earn energy from weak spots + clear errors |
| **遠征動畫** (`neurons-maze-expedition`) | COSMETIC ONLY: parallax band on `/maze-beta` of the squad marching; spec mandates it MUST NOT read/mutate maze state | — | decoration |

## Canonical distinction: input ↔ output, NOT two competing journeys

- **maze = output**: where energy is *spent* — forward progression, collecting NEW variants.
- **出征 = input / remediation**: where energy is *generated* from your weak spots, while clearing your error backlog.
- **出征 feeds maze**: the energy + maze-signal produced by answering correctly during 出征 is exactly the fuel that advances the maze frontier. They are an input→output pair, not two overlapping exploration loops.

This is why they are NOT redundant despite shared squad/journey imagery.

## 出征 reward — two layers

**(1) Per-answer (already live).** 出征 has a single answer entry point (`QuizModal` → `recordCorrectAnswer`), so every correct answer in 出征 already grants the normal per-answer rewards:
- neural energy (mastery-accelerated as of `wire-mastery-energy-acceleration`, 2026-06-03) + maze signal + mastery counter↑ + squad celebration
- flips `questionHistory.lastResult` wrong→correct → removes it from the 「目前未答對」 pool (the intrinsic "I cleared this error" reward)

**(2) Completion bonus (deliberately a no-op today).** `lib/services/expedition.ts` `onExpeditionComplete(_session)` is an explicit no-op extension point, reserved by its own comment for a future `add-neurons-expedition-rewards` (Phase 4). There is currently NO "finished an expedition session" bonus.

## Deferral — completion reward goes to #3 / Phase 4, not now

Owner-confirmed 2026-06-03: lock the framing now (this doc); defer the completion reward. Rationale:
- The reward's **balance depends on #3 `promote-maze-to-home`'s pacing recalibration** (`SIGNAL_PER_NODE` ~4–5×). Tuning the bonus pre-#3 = re-tuning post-#3 = double work.
- #3 makes the maze the home and overlays the connectome → the 出征 panel placement + how the reward plugs into the (then-unified) energy model both shift.

**Direction for the Phase-4 grill (a target, not a decision):** the completion bonus should reward **how many wrong questions were CLEARED this session (wrong→correct flips), not raw correct count** — this rewards genuine remediation, cannot be farmed by re-answering already-known questions (the pool is wrong-only and depletes as you clear it). Whether the bonus is energy / a guaranteed maze settle / mastery-tier progress is the fork to grill then.
