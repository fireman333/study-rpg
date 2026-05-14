## Tasks

### Spec

- [x] **T1**: Write `specs/persistence/spec.md` with 6 requirements

### Impl

- [x] **T2**: Add `PLAYER_ID = 'p1'` constant + hydrate-on-mount `useEffect` to `App.tsx`
- [x] **T3**: Add persist-on-change `useEffect` for `[player]` → `db.players.put`
- [x] **T4**: Add persist-on-change `useEffect` for `[instances]` → transaction clear+bulkAdd
- [x] **T5**: New component `apps/medexam-tw/src/components/PersistenceButtons.tsx` (Export + Import + Reset)
- [x] **T6**: Wire export: serialize `{ player, instances, schemaVersion: 1 }` → blob → download
- [x] **T7**: Wire import: file input → FileReader → JSON.parse → shape validation → confirm → setState
- [x] **T8**: Render `<PersistenceButtons>` in App.tsx actions area
- [x] **T9**: Style export/import buttons in `styles.css`

### Verify

- [x] **T10**: `pnpm -r typecheck` green
- [x] **T11**: `pnpm --filter @study-rpg/medexam-tw build` green; src/ clean
- [x] **T12**: Chrome MCP smoke — abstract test:
  - Roll 3 cards → confirm instances state
  - Reload page → confirm instances + player.lootStats restored
  - Click "💾 Export" → check downloaded JSON shape via blob URL
  - Inject mock JSON → click "📂 Import" → confirm state replaced

### Archive

- [x] **T13**: `openspec validate wire-persistence-mvp`
- [x] **T14**: `openspec archive wire-persistence-mvp -y`
- [x] **T15**: auto-git commit
