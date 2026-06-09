## Context

Owner dogfooding surfaced five presentation inconsistencies on `/collection` + `/dmn`. All are display/copy/asset; none touch Dexie, R2 sync, the Worker, D1, or any game logic. The only spec-level change is the connector section's display model (item 1). The other four are direct edits mirroring patterns already used elsewhere in the app.

## Goals / Non-Goals

**Goals:**
- Make the 連結神經元 section match the per-family variant open-collection model (only unlocked shown, total hidden).
- Pixel-consistent 醫學一/醫學二 divider emoji.
- Stop exposing the decay-but-permanent mechanic to players.
- Tuck the 分享卡 button top-right (RWD-safe).
- Bring `/dmn` onto the shared cream/brown theme.

**Non-Goals:**
- No change to connector unlock / permanence / backfill / sync behavior — only its display.
- No new connector per-pair art (the generic bridge sprites already ship).
- No DMN gameplay / catalog / card-art change.
- No Dexie / R2 `SCHEMA_VERSION` / Worker / D1 change.

## Decisions

### 1. Connector open-collection (ConnectorSection.tsx)
- Filter `entries` to `entry.unlocked` before mapping; render only unlocked cards.
- Drop the locked branch entirely: the `ConnectorGlyph` `locked` param + the card's `opacity:0.55` / grey background / grayscale-filter / `（未解鎖）` aria are removed (the `locked` arg becomes always-false → simplify `ConnectorGlyph` to drop the param, or keep but only ever pass unlocked cards).
- Count: `{unlockedCount} / {total}` → `🔗 {unlockedCount} 隻` (drop `total`; `useConnectors().total` may stay unused or be dropped from the destructure to avoid an orphan).
- Empty state: when `unlockedCount === 0`, show a short hint (e.g.「尚未長出任何連結神經元 — 兩科一起出征修復錯題即可解鎖」) instead of 55 silhouettes.
- This mirrors `CollectionPage`'s per-family open-collection (`🧬 X 隻`, no denominator, no silhouettes).

### 2. Pixelate divider emoji (CollectionPage.tsx + FamilyPicker.tsx)
- Replace the literal `🧠`/`🔬` in the paper-group headers with `<EmojiIcon char="🧠" size={...} />` etc. `EmojiIcon` resolves `public/icons/emoji/<codepoint>.png`; on a missing PNG it falls back to the native glyph (no breakage).
- `🧠` = `1f9e0.png` already in the pack. `🔬` = `1f52c` is **missing** → generate `apps/neurons-tw/public/icons/emoji/1f52c.png` via codex `gpt-image-2` (`-m gpt-5.5 --sandbox workspace-write --skip-git-repo-check`, save to `/tmp` then `mv`), 384×384 16-color transparent, matching the existing pack's flat GBA style (cross-check against an existing pack PNG like `1f52d.png` 🔭 for style parity). No-text constraint in the prompt.
- FamilyPicker's `PAPER_META` label currently embeds the emoji in the string (`'🧠 醫學一'`). Split the emoji out so it renders via `EmojiIcon` beside the text (same treatment as CollectionPage), keeping the two surfaces consistent.

### 3. Drop decay-mechanic copy (ConnectorSection.tsx + HelpMenu.tsx)
- ConnectorSection blurb: `「永久收藏，連線衰退也不會消失。」` → `「永久收藏。」`.
- HelpMenu synapse-decay line (`連續 7 天沒一起修復會降一級（strong → weak → dormant），但永遠不會消失。`): simplify to not narrate the decay→permanent mechanic (e.g. keep the「一起出征修復會長出連線」framing, drop the strong/weak/dormant + 永不消失 detail).
- HelpMenu `connector-neuron` section: keep the "what it is / how to unlock" framing, remove any decay-permanence wording.
- Behavior is unchanged — connectors are still permanent; we just don't surface the mechanic. HelpMenu copy is not spec-pinned (de-enumerated).

### 4. Share-card button → top-right (CollectionPage.tsx)
- Move the 分享卡 button out of the centered header flow into the page's top-right. Implementation: make the page header a flex row (title block left, share button right) OR position the button absolutely top-right of the page container.
- RWD: on narrow viewports (< 768px) the button must not overlap the「神經元圖鑑」title — either collapse to icon-only (`🔗`) or drop below the title right-aligned. Verify with the CSS-class-override RWD probe (resize_window is unreliable per project memory).

### 5. DMN page re-theme (DmnCollectionPage.tsx + BackpackPanel.tsx + EquipmentDexPanel.tsx)
- The DMN tab's dark theme lives in THREE files, not one: the page (`DmnCollectionPage`) plus the two sub-panels it mounts (`BackpackPanel` 背包, `EquipmentDexPanel` 裝備). All three must be re-themed or the tab stays half-dark. (The global nav `DmnDrawButton`「DMN · N」chip keeps its accent — it appears on every page, out of scope.)
- Swap the dark-purple palette for the shared cream/brown one. Mapping (apply consistently across `pageStyle` + all sub-styles + the two panels):
  | Dark (now) | Cream (target) |
  |---|---|
  | bg `#0f0c24` / tile `#1c1838` / sprite-wrap `#0a081a` | `#fbf6e9` page / `#f4ecd8` tiles / `#f4ecd8` sprite-wrap |
  | text `#e6e6fa` / `#d4c4ff` / `#b8b3d4` / `#5d5878` | `#3a2a1a` body / `#5a3e1a` heads / `#8c6d4a` muted |
  | border `#3d3270` | `#c9b48f` / `#8c6d4a` |
  | accent (rarity P-colors) | keep rarity chip colors as-is (they read fine on cream); only re-map the page chrome |
- Keep rarity tier colors (`P1 #d4a04d` … ) — they are content semantics, not page chrome, and contrast fine on cream.

## Risks / Trade-offs
- **Connector total hidden:** players lose the "55 to collect" completionist signal. Accepted — it matches the deliberate open-collection design already chosen for variants (catalog total hidden).
- **🔬 sprite style drift:** a one-off codex gen may not perfectly match the pack. Mitigation: cross-check against an existing pack PNG; regenerate if off. If codex is rate-limited, fall back to Chrome-MCP Gemini per `image_gen_routing.md`. Worst case the native glyph still renders (EmojiIcon fallback) — non-blocking.
- **DMN re-theme breadth:** ~20+ color values; risk of missing one (a stray dark value on cream). Mitigation: grep the file for `#0f0c24|#1c1838|#3d3270|#e6e6fa|#d4c4ff|#b8b3d4|#0a081a|#5d5878` after editing to confirm none remain, plus a Chrome-MCP screenshot.
- **Share-button RWD:** absolute positioning can overlap on small screens. Mitigation: RWD class-override probe at 360/414/768.
