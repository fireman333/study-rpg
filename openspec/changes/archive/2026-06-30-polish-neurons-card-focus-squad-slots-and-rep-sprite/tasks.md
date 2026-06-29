## 1. Family-card 聚焦 → AP row

- [x] 1.1 Remove the 🔍 聚焦 button from the `FamilyCard` header (header = sprite + full name, no longer truncated).
- [x] 1.2 Render the 🔍 聚焦 button on the AP line — make `apLineStyle` a flex row `[AP n] … [🔍 聚焦]`; drop the header-only `alignSelf`; add `aria-label` for the icon-only mobile state.

## 2. SquadManager slot grid

- [x] 2.1 Switch the slot row to `className="neurons-squad-slots"` (CSS grid `repeat(5, minmax(0,1fr))`); add the styles.css rule + the 3-col (<768px) / 2-col (<430px) reflow.
- [x] 2.2 Drop the inline `clamp(96px,18vw,120px)` width from filled + empty slots (grid sizes them); add `minWidth:0`. Remove the now-unused `slotRowStyle`.

## 3. Family-card representative sprite sync

- [x] 3.1 Add `useRepresentativeRows(): Map<familyId, NeuronVariantRow>` to `representatives.ts` (liveQuery `representativeVariants` meta + `neuronVariants`, drop stale entries).
- [x] 3.2 `FamilyPicker` calls the hook and passes each family's `repRow` to its card; `FamilyCard` renders `<VariantSprite row={repRow} />` when present, else the generic subject sprite.

## 4. Verification

- [x] 4.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (755).
- [x] 4.2 Confirm NO Dexie / R2 schema bump (reuses `representativeVariants` + `activeSquad`).
- [x] 4.3 Chrome MCP smoke: 聚焦 on the AP row + subject name no longer truncated; SquadManager 5 even columns (single-line names); family card sprite = representative variant (rep set) vs generic (no rep).
