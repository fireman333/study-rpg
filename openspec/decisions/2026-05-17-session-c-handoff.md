# Decisions — 2026-05-17 (Session C handoff)

## 15:30 — M4 cloud sync: 一階 sync core DI refactor + 二階 mirror shipped

**Context**: Continuation of `~/.claude/scratch/handoff-study-rpg-m4-二階-mirror-2026-05-17.md` (Session A/B/C plan from 10:50 handoff). All three pieces landed this session.

### Session A (main / commit 85572b2): sync core DB-generic via adapter DI

Resolved the hard blocker for 二階 mirror — `apps/medexam-tw/src/lib/sync/` was hardcoded to `StudyRpgDB` + `ONE_STAGE_ADAPTERS` despite `add-cloud-sync` design D4 declaring "engine accept table list + Dexie instance via DI, content-pack-agnostic". Refactor:
- `types.ts`: `db: StudyRpgDB` → `db: Dexie`; new `adapters: ReadonlyArray<TableAdapter>` field
- `tables.ts`: TableAdapter methods take generic `Dexie`; adapter bodies cast `(db as StudyRpgDB)` for typed table access
- `engine.ts`: drop `import { ONE_STAGE_ADAPTERS }`, use `opts.adapters`
- `useSync.ts`: pass `adapters: ONE_STAGE_ADAPTERS` to `createSyncEngine`

Verified zero behavior change via Chrome MCP push/pull round-trip on tony85314@gmail.com dogfood account.

### Session B (track-m2 / commit d585cfc): 二階 cloud sync mirror

`apps/medexam2-hospital-tw/` gets:
- HospitalDB v5: additive `meta` + `localBackup` tables (no upgrade hook needed)
- `lib/auth/{client,AuthContext}.ts`: copied verbatim from 一階; shared `storageKey: 'study-rpg.auth'` for same-origin auto-share in prod
- `lib/sync/{types,engine}.ts`: copied verbatim (DB-generic post-Session A)
- `lib/sync/tables.ts`: NEW `HOSPITAL_ADAPTERS` for 4 Postgres tables:
  - `hospital_state` (singleton, JSONB blob via gameCounters hook)
  - `hospital_doctors` (collection, pk=id)
  - `hospital_mastery` (collection, flat correct/total)
  - `hospital_question_history` (collection, pk=question_id)
- `lib/sync/useSync.ts`: minimal first-pass (no migration modals yet — engine starts on authed)
- `components/AuthButton.tsx`: simplified vs 一階 (authed click signs out directly)
- `main.tsx` + `App.tsx` + `styles.css` wired

Smoke verified on localhost:5175 — engine starts, push fires, cloud rows appear, pushAllNow bootstraps, reload pull works.

### Session B decisions noted but deferred to follow-up

These are NOT in d585cfc and remain `[ ]` in add-cloud-sync tasks.md:

1. **Migration UI mirror** — `MigrationUploadPrompt` / `ConflictChooserModal` / `migration.ts` for 二階. First-pass relies on silent debounce push (equivalent to user clicking「Upload local」). Acceptable for dogfood owner whose 一階 + 二階 are on same machine; needs full mirror before cross-device 二階 onboarding works cleanly.
2. **SettingsPanel for 二階** — currently authed AuthButton signs out directly (lossy UX for accidental click). Mirror 一階's SettingsPanel with export / delete RPC integration.
3. **Session-gated tick interaction** — when `redesign-hospital-economy` applies, tick will be session-active-only. Writes to gachaStats/tickets/rooms/affinity (which only hook via gameCounters changes) need explicit dirty-trigger when no session is active. Currently OK because tick fires every 5 sec unconditionally pre-redesign.

### Why dual-worktree pattern worked here

Session A on `main` (一階 territory), Session B on `track-m2` (二階 territory). Each session's commit landed on the correct branch. Merged `track-m2` → `main` post-Session-B to bring 二階 wiring forward for deploy. No conflict — refactor + propose were 一階 territory, mirror was 二階 territory, branches stayed clean.

### redesign-hospital-economy propose (commit 724106a)

Adjacent to but separate from M4 work. Big spec change covering hospital economy redesign (study session timer + per-Q reputation removal + tier dual-gate + 7 capability deltas). Pure propose — not implemented, not archived. Pacing target: median player 30-day endgame.

Audit pass surfaced and fixed:
- B1: 12 P2+ unique subjects → 10 P2+ + 1 P1 (any subject)
- B2: voluntary retire with 24-hr diversification grace
- B3: monotonicCounters separate row for MAX-merge cloud sync vs LWW gameCounters
- C2: event rate cap 50% → 30% + 5-min cooldown + toast for passive events
- C3: room extension cost cut (50k→20k outpatient etc.)
- C4: 醫療糾紛 settlement edge case (revenue < 10k disables option)
- C5: v6 migration modal for existing players in hospital-tutorial spec

108 tasks across 16 stages. Requires `add-cloud-sync` archived (v5 schema bump) before apply (v6 chain).

## What's still open for the 30-day endgame milestone

1. **add-cloud-sync archive**: blocked on Migration UI mirror tasks 8.1 / 8.6 / 8.7 + spec validate per /opsx:verify. Earliest realistic archive: after one more session for migration modals.
2. **redesign-hospital-economy apply**: stage 0 prereq is `add-cloud-sync` archived. Once archive lands, propose → apply pipeline can start (~4-6 sessions of implementation).
3. **Production push of d585cfc**: 二階 sync needs to be live before scale dogfood across devices.

## How to apply

Next session opening: `/spec resume` → should auto-load this decision file + add-cloud-sync proposal + redesign-hospital-economy proposal + project.md. Then user decides:
- Continue M4 wrap-up (migration UI mirror) →
- Push current state for deploy →
- Start redesign-hospital-economy apply →
