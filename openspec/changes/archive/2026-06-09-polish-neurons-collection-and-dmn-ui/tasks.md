## 1. Connector open-collection (item 1 — spec)

- [x] 1.1 `ConnectorSection.tsx`: filter `entries` to unlocked only; render only unlocked cards (removed the locked silhouette branch + the `ConnectorGlyph locked` param)
- [x] 1.2 Count `{unlockedCount} / {total}` → `🔗 {unlockedCount} 隻`; dropped the now-unused `total` from the `useConnectors()` destructure
- [x] 1.3 Empty state when `unlockedCount === 0` (short hint, not 55 silhouettes)
- [x] 1.4 No behavior change: unlock / permanence / backfill / sync untouched (display-only)

## 2. Divider emoji pixelation (item 2 — asset + display)

- [x] 2.1 Generated `apps/neurons-tw/public/icons/emoji/1f52c.png` (🔬) via codex `gpt-image-2`, trimmed/centered to 64×64 transparent matching the pack; registered the row in `lib/emoji-icons.ts` (PNG alone is not enough — the registry gates it)
- [x] 2.2 `CollectionPage.tsx`: paper-divider 🧠/🔬 render via `<EmojiIcon>`
- [x] 2.3 `FamilyPicker.tsx`: emoji split out of `PAPER_META` labels, rendered via `<EmojiIcon>`

## 3. Drop decay-mechanic copy (item 3 — copy)

- [x] 3.1 `ConnectorSection.tsx` blurb → `「永久收藏。」`
- [x] 3.2 `HelpMenu.tsx`: synapse-decay line + connector-neuron section simplified (no strong/weak/dormant + 永不消失)

## 4. Share-card button → top-right (item 4 — layout)

- [x] 4.1 `CollectionPage.tsx`: 分享卡 button moved to the header top-right (flex row, `space-between` + `flex-wrap`), RWD-safe

## 5. DMN page re-theme (item 5 — CSS)

- [x] 5.1 `DmnCollectionPage.tsx` + `BackpackPanel.tsx` + `EquipmentDexPanel.tsx`: dark-purple → shared cream/brown (rarity tier colors kept; activate button → gold). All three files re-themed.
- [x] 5.2 Grepped all three for residual dark hexes — none remain (only the gold activate button's white text survives, intentional)

## 6. Verify

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean + 492 vitest pass
- [x] 6.2 Chrome MCP (dev): `/collection` — connector only-unlocked + `🔗 X 隻` (no /55, no silhouettes, seeded card verified); 🧠/🔬 dividers = pack PNG `<img>`; share button top-right; console clean
- [x] 6.3 Chrome MCP RWD probe (360/414/768, synchronous reflow — no rAF): share button no overlap with title
- [x] 6.4 Chrome MCP (dev): `/dmn` + 背包/裝備 panels render cream, consistent with other tabs; console clean
- [x] 6.5 `openspec validate polish-neurons-collection-and-dmn-ui --strict` passes

## 7. Ship

- [x] 7.1 Code-quality: inline cleanup done during apply (removed locked branch + `ConnectorGlyph` `locked` param + unused `total` destructure; no orphans). Full `/simplify` skipped — change is mechanical color/copy/layout, no logic to simplify.
- [ ] 7.2 `/opsx:archive` (sync `neurons-connector-family` delta into main spec)
- [ ] 7.3 Commit (explicit per-file add) → merge track-neurons → main → push → CF Pages deploy green → prod three-piece verify
