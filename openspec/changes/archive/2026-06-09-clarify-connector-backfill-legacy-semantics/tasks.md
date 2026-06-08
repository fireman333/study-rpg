## 1. Spec audit (read-only — locate connector data + render sites)

- [x] 1.1 Read `apps/neurons-tw/src/lib/services/connector-neuron.ts` (or wherever the connector unlock + backfill helpers live) and identify the row-insert sites for forward unlock and backfill. Note whether an `unlockSource`-shaped field already exists in any form.
- [x] 1.2 Read the connector Dexie store declaration (probably `apps/neurons-tw/src/lib/db.ts`) and confirm the row type. Confirm `unlockSource?: 'legacy-backfill' | 'validated'` can be added as an optional field without requiring a `.version()` bump (existing Dexie behavior: extra fields on existing stores need no schema bump as long as no index changes).
- [x] 1.3 Read `apps/neurons-tw/src/lib/sync/tables.ts` connector adapter (or equivalent) and confirm the union-merge propagates arbitrary row fields (`unlockSource` will pass through transparently if the adapter does `db.put(incoming)` without field filtering). Note any filter that would strip the new field.
- [x] 1.4 Read the collection-page connector render (probably `apps/neurons-tw/src/routes/CollectionPage.tsx` or a dedicated `ConnectorSection.tsx`) and identify where the unlocked-connector card is rendered. Identify how the wire's current `lastCoFireDate` is or can be made accessible at render.

## 2. Code edits

- [x] 2.1 Extend the connector row type at the data layer with `unlockSource?: 'legacy-backfill' | 'validated'` (optional, no default).
- [x] 2.2 Update the forward-unlock helper to stamp `unlockSource: 'validated'` on insert.
- [x] 2.3 Update the backfill helper to stamp `unlockSource: 'legacy-backfill'` for wires whose `lastCoFireDate` precedes the conduction-rework ship epoch, and `unlockSource: 'validated'` otherwise. The ship epoch SHALL be the same constant `connectome-collection` uses for legacy-trace detection — apply phase grabs it from wherever it's already defined (likely `apps/neurons-tw/src/lib/services/connectome.ts` or a shared const).
- [x] 2.4 If 1.3 found a field filter that would strip `unlockSource`, extend the allowlist. Otherwise no-op.
- [~] 2.5 (SCOPED OUT — MAY clause; UI marker deferred) (Optional, only if implementing the UI marker) Update the connector card render to show the「早期連線·已收藏」chip when `unlockSource === 'legacy-backfill'` AND the corresponding wire is currently in legacy state (`lastCoFireDate < shipEpoch`). Skip if scoping the marker out.

## 3. Tests (vitest)

- [x] 3.1 Add `apps/neurons-tw/src/__tests__/connector-unlock-provenance.test.ts` covering:
  - Forward unlock via `synapseStrengthened` event stamps `'validated'`
  - Backfill of a pre-epoch wire stamps `'legacy-backfill'`
  - Backfill of a post-epoch wire stamps `'validated'`
  - Backfill is idempotent: pre-existing connector row's `unlockSource` is not overwritten
  - Pre-change row with no `unlockSource` is preserved on read / sync
- [~] 3.2 (SCOPED OUT — depends on 2.5) If 2.5 added the UI marker, extend the existing `CollectionPage` or `ConnectorSection` component test to assert: marker shows for `'legacy-backfill'` + legacy wire; marker absent for `'legacy-backfill'` + re-validated wire; marker absent for `'validated'` or `undefined`.

## 4. Verification

- [x] 4.1 Run `pnpm --filter @study-rpg/neurons-tw test` — all green.
- [x] 4.2 Run `pnpm -r typecheck` — clean.
- [x] 4.3 Run `pnpm lint:dexie-fixtures` — pass (no `.version()` bump). If apply phase discovers an unavoidable bump, add the fixture per `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`.
- [x] 4.4 Run `openspec validate clarify-connector-backfill-legacy-semantics` — clean.
- [x] 4.5 Run `/opsx:verify` — green on completeness / correctness / coherence.
- [~] 4.6 (SCOPED OUT — only if 2.5) Chrome MCP smoke (only if §2.5 implemented the marker): preflight `list_connected_browsers` → boot localhost → seed a save with one legacy + one validated connector → confirm the legacy connector shows the marker, the validated one doesn't.

## 5. Archive

- [x] 5.1 Confirm working tree is clean of unrelated changes per multi-agent git safety rule.
- [x] 5.2 `/opsx:archive` — sync delta into `openspec/specs/neurons-connector-family/spec.md`.
- [ ] 5.3 Auto-git commit (explicit per-file add) with subject `spec(archive): merge clarify-connector-backfill-legacy-semantics — connector lifetime-vs-validated 二分 + unlockSource provenance`.
- [ ] 5.4 Push to origin/track-neurons. Merge to main left to user-driven sync per project workflow.
