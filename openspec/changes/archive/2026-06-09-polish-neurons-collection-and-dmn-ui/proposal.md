## Why

The `/collection` and `/dmn` pages have several presentation inconsistencies that surfaced during owner dogfooding:

- The 連結神經元 (connector) section is the only collectible surface that still shows **未解鎖剪影** (a closed `N/55` dex with grey silhouettes). Every other collected surface on `/collection` — the per-subject variant families — uses an **open-collection** model: only collected items render, the catalog total is hidden, the count is a pure `🧬 X 隻`. The connector section reads as a different game.
- The connector intro and the HelpMenu expose a **decay-but-permanent** mechanic ("連線衰退也不會消失") that is more complexity than the player needs to know.
- The 醫學一/醫學二 divider emoji (🧠/🔬) render as **native OS emoji**, breaking the GBA pixel aesthetic the rest of the chrome uses (`EmojiIcon`).
- The 「分享卡」 button sits centered under the subtitle — the owner wants it tucked top-right.
- The `/dmn` page is the **only** tab on a dark-purple theme; every other tab is cream/brown. The inconsistency is jarring when tab-switching.

These are all small visual/copy fixes that make the two pages consistent with the rest of the app.

## What Changes

1. **Connector open-collection** — `ConnectorSection` renders ONLY unlocked connectors (no locked silhouettes); the count becomes `🔗 X 隻` (no `/55` denominator), mirroring the variant-family open-collection model. Underlying behavior (closed 55-set, first-`strong` unlock, permanence, union-monotonic sync) is unchanged — only the display layer.
2. **Pixelate divider emoji** — 🧠/🔬 on the 醫學一/醫學二 dividers render via `EmojiIcon` (CollectionPage + the homepage FamilyPicker, for consistency). 🧠 (`1f9e0`) already has a PNG; a 🔬 (`1f52c`) PNG is generated to match the existing pack style.
3. **Drop decay-mechanic copy** — the connector blurb and the HelpMenu synapse-decay / connector sections no longer expose the decay-but-permanent mechanic.
4. **Share-card button → top-right** — moves from centered-under-subtitle to the `/collection` header's top-right, RWD-safe (does not overlap the 神經元圖鑑 title on mobile).
5. **DMN page re-theme** — `DmnCollectionPage` swaps its dark-purple palette for the cream/brown palette every other tab uses.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-connector-family`: the collection-page display requirement changes from a closed `N/55` dex (unlocked + locked silhouettes) to an **open collection** (only unlocked connectors render; the closed-set total is hidden from the player). Unlock, permanence, and sync requirements are unchanged.

## Impact

- **Code (display/copy/layout only, no schema/sync/behavior change):**
  - `apps/neurons-tw/src/components/ConnectorSection.tsx` — filter to unlocked, drop silhouette rendering + `/55` count, trim blurb copy
  - `apps/neurons-tw/src/routes/CollectionPage.tsx` — `EmojiIcon` on dividers, share button → top-right
  - `apps/neurons-tw/src/components/FamilyPicker.tsx` — `EmojiIcon` on the paper-group headers (consistency)
  - `apps/neurons-tw/src/components/HelpMenu.tsx` — simplify synapse-decay + connector copy
  - `apps/neurons-tw/src/routes/DmnCollectionPage.tsx` — cream/brown palette
- **Asset:** new `apps/neurons-tw/public/icons/emoji/1f52c.png` (🔬, codex `gpt-image-2`, 384×384 16-color transparent, matching the pack)
- **No** Dexie / R2 `SCHEMA_VERSION` / Worker / D1 change. No new dependency.
- **Spec:** `neurons-connector-family` MODIFIED (item 1 only). Items 2–5 are display/copy/asset with no spec delta.
