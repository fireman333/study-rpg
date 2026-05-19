## Context

`QuizModal` is the primary "do a question" surface in the 二階 app. A companion doctor sprite + name appears on the partner strip; the player can switch via an in-modal `<select>` dropdown. The companion choice does not affect reward math (specialty multiplier is computed from `boundDoctor.subjectId` + current question subject — the player's identity choice within the roster is purely social / narrative + sometimes specialty-bonus-relevant). Today `QuizModal.tsx:51-61` reads `db.doctors` ordered by `obtainedAt DESC` and, when `boundDoctorId` is the initial `null`, picks `doctors[0]` (newest). Because the component is a modal that gets mounted fresh each time the player clicks "開始練題", `boundDoctorId` resets to `null` on every open and the auto-pick fires again — silently re-selecting whoever the player just recruited.

Existing key-value persistence pattern is already established: `services/er-consultation.ts` writes ER consult settings into `db.meta` (a `{ key, value: unknown }` table added at v5 for cloud-sync migration choices, repurposed for any small local-only UI preference). No new schema, no new migration, no cloud-sync involvement is required to fix the bug.

## Goals / Non-Goals

**Goals:**

- Player's chosen companion doctor persists across `QuizModal` opens on the same device.
- Recruiting a new doctor never silently replaces the active companion.
- Graceful fallback when the persisted doctor no longer exists in the roster (retired / cleared) — fall back to most-recently-obtained, same as today's "no selection yet" path.
- Zero impact on brand-new players: the first time they open the modal with no prior selection, they still get the most-recently-obtained doctor pre-selected.
- Update `hospital-quiz` spec to document the new sticky semantics + fallback path; the current spec literally mandates "default = most recently obtained", so without revising it the implementation would be spec-non-compliant.

**Non-Goals:**

- Cross-device sync of companion-doctor preference. `meta` is local-only by design and that matches the desired UX (a per-device study setup, like the ER-consult settings). Cross-device sync would require either widening the LWW whitelist or stuffing the field into `gameCounters` / `hospital_state`, both of which are larger blast-radius than this bug deserves.
- Surfacing a "your companion is Dr. X" banner / toast on roster changes. The dropdown's selected option already shows the current pick; no extra UX needed.
- Changing the partner-strip layout, sprite logic, or specialty-bonus math.
- Editing one-shot 模擬考 / SRS / 導師 flows. Those use their own doctor binding (or none) and aren't affected by this change.

## Decisions

### Decision: Use the existing `meta` Dexie table, key `quiz.companionDoctorId`

**Rationale:** `meta` is already the bag-of-key-value singleton for per-device UI preferences (`services/er-consultation.ts:74-97` uses it for `er-consult.settings`). The `meta` table is local-only — perfect granularity for "which roster doctor accompanies me on this device." Reusing it means zero Dexie version bump (the table already exists at v5+) and zero touch on the v9-era cloud-sync whitelist.

**Alternatives considered:**

- **Add `companionDoctorId` field to `gameCounters` singleton.** Pros: would cloud-sync automatically. Cons: widens the diff to include schema upgrade hook + cloud sync table-adapter changes + risk of LWW conflicts on multi-device sign-in. The bug is a single-device UX bug; cross-device sync is a separate feature that the player has not asked for.
- **Per-doctor `isCompanion` boolean on `DoctorRow`.** Cons: requires a singleton invariant (only one doctor can have `isCompanion=true`) that has to be enforced in code on every doctor write. `meta` key is the cleaner single-source-of-truth.
- **Add a new dedicated `quizPrefs` table.** Cons: overkill for one string.

### Decision: Mount-time resolution order — persisted → fallback newest

**Rationale:** Resolution order on `QuizModal` mount:

1. Read `meta['quiz.companionDoctorId']` (`useLiveQuery` so it stays current if e.g. another tab writes).
2. If the persisted ID exists AND is present in the `doctors` array → use it as `boundDoctorId`.
3. Otherwise → use `doctors[0]` from the `obtainedAt DESC` query (today's behaviour).

This preserves the zero-config newcomer experience (first ever quiz opens with newest doctor pre-selected) AND keeps the picker robust to roster churn (if the persisted doctor was retired, fallback is automatic rather than throwing or leaving an "undefined" partner strip).

**Alternatives considered:**

- **Always default to newest unless `boundDoctorId !== null`.** This is today's behaviour and is exactly the bug.
- **Default to highest-affinity doctor or specialty match.** Too magic; the player should be in control. We let them pick, then remember.

### Decision: Write meta on every dropdown change AND on the initial fallback

**Rationale:** Two write sites:

1. **Initial fallback write** — when no persisted ID exists and the player opens the modal, after the useEffect sets `boundDoctorId` to `doctors[0].id`, also persist it. This means the very first open establishes a "remembered" selection even if the player never touches the dropdown. Recruiting a new doctor afterwards will not displace this remembered selection because the next mount finds the persisted ID and uses it.
2. **Picker change write** — whenever the dropdown `onChange` fires, persist the new ID immediately. Fire-and-forget (`void setQuizCompanionDoctorId(id)`); we don't need to await before updating local React state.

**Alternatives considered:**

- **Only persist on explicit dropdown change.** Means a player who has never used the picker still gets "newest" semantics on every open — the bug remains for the silent-default majority of players.
- **Persist on modal close.** Slightly more surprising semantics (e.g., if app crashes mid-quiz, choice is lost). Eager persist is simpler and matches ER-consult settings pattern.

### Decision: Spec delta is MODIFIED on the existing requirement, not a new requirement

**Rationale:** The behaviour being changed is exactly one existing requirement + one existing scenario (`spec.md:99` + `spec.md:108-112`). The contract — "QuizModal has a bound doctor; player can change it mid-session; subjectId is non-load-bearing" — stays intact. Only the default-resolution semantics change. So `## MODIFIED Requirements` with the full updated requirement block is the right delta op (per the openspec `specs` instruction guidance).

## Risks / Trade-offs

- **Risk: `useLiveQuery` race on first mount.** The persisted ID query and the doctors query are two separate `useLiveQuery` calls; the persisted ID could arrive after `doctors` is already populated, causing a one-frame flicker where the partner strip shows newest and then swaps to remembered. → **Mitigation:** Gate the useEffect on both being non-undefined (`doctors !== undefined && persistedId !== undefined`). One render of "loading…" partner strip is acceptable; today's behaviour already has a one-frame flash when `doctors` lands.
- **Risk: persisted doctor was retired.** → **Mitigation:** The mount-time validation `doctors.find(d => d.id === persistedId)` returns undefined; fallback to newest fires automatically; we also rewrite the meta row to the new newest so the picker is in a coherent state. No special UI message — silent recovery is fine because this is a rare edge case and the player will see a different doctor on the partner strip anyway.
- **Risk: future cloud sync of companion preference.** Some players may eventually want cross-device sync. → **Mitigation:** Out of scope today. If demand emerges, future change can either add the field to `gameCounters` (which is cloud-synced) or expand `meta` to be per-user-key. The current key `quiz.companionDoctorId` is namespaced and future-friendly.
- **Trade-off: per-device, not per-account.** Player signing in on a fresh device starts over with newest-doctor default until they open the picker once. Accepted; matches ER-consult settings precedent.
- **Trade-off: no migration / no Dexie version bump.** Zero risk of breaking existing saves, but also zero introspection — there's no DB-level evidence of the feature beyond a single key in `meta`. Acceptable for a tiny UI preference.

## Migration Plan

- No data migration. The first time an existing player opens the quiz modal after the deploy, they hit the "no persisted ID" branch → fallback to newest → write persisted ID. From that point forward, recruits no longer displace.
- Rollback: revert `QuizModal.tsx` + delete `services/quiz-companion.ts`. The `meta` row left behind from rolled-back versions is harmless (unknown key in a key-value store).
