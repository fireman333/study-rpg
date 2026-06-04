## Why

`add-neurons-acceleration-system` shipped 12 permanent "equipment/companion" items, but the **夥伴 (companion)** half of that vision — design Decision 3's "independent following sprites (companion / pet / aura), never body-worn" — only materialized as a static dex grid (`EquipmentDexPanel`) + a passive additive bonus. There is **no on-screen companion that actually follows the player**. A player who collects 寡突膠細胞夥伴 sees a picture and a number, not a living cell tagging along. This change adds the missing visual-companionship layer so the glia you collect literally accompany you while you study/explore.

## What Changes

- **New presentational layer**: owned **living-cell glial companions** march as additional sprites in the **expedition animation band** (`神經元遠征隊` / `MazeExpedition`), riding along at the back of the squad parade. They appear **only** in the expedition animation (the homepage band while reading-active + the compact QuizModal 出征 band) — **never** as a permanent brain-map fixture. (Owner decision 2026-06-04: "夥伴不放 brain-map，出征動畫才顯示".)
- **Companion subset is catalog-declared, not all equipment**: only the items that are *actual living cells* march. In today's `EQUIPMENT_CATALOG` that is exactly **2** items — `eq-oligodendrocyte-companion-p3` (寡突膠細胞夥伴) + `eq-astrocyte-glycogen-p3` (星形膠細胞糖原庫). All structural/molecular items (myelin wraps, nodes of Ranvier, Na⁺/K⁺ pump, lactate, glucose, mitochondria, …) stay **dex-only passive** and do **not** appear. Declared via an explicit `companion: true` field on the 2 glia `EquipmentDef` entries (catalog = single source of truth; additive, existing consumers ignore the field).
- **Animation inherits the band**: companion marchers reuse the band's existing `exp-bob` + depth-stagger + paused/hidden + reduced-motion treatment — no separate animation system. Sprite is placeholder-first: the existing static `equipment:<id>` art today; real multi-frame idle sheets are deferred to a flagged follow-up **`generate-companion-animation-frames`** (Gemini/codex batch), swapping the `companion:<id>` asset with zero code change.
- **No clutter risk**: companions append at the back of the parade; only 2 exist today, and the band already lays out a small marcher set.
- **No gameplay change**: a companion item still contributes its acceleration passive bonus exactly as today — this layer is purely additive visual, on top of the unchanged passive.

## Capabilities

### New Capabilities
- `neurons-living-companion`: the companion-render contract — which owned equipment renders as an on-screen companion (catalog `companion: true` subset), that companions appear **only** in the expedition animation (never on the brain-map), the placeholder-vs-animated-asset resolution, and the zero-schema derivation.

### Modified Capabilities
- `neurons-maze-expedition`: the expedition animation band's squad parade additionally includes owned living-cell companions as marchers (appended at the back; inheriting the band's bob / depth-stagger / paused-hidden / reduced-motion treatment).

## Impact

- **Code (neurons-tw only, `track-neurons`)**:
  - `packages/content-neurons-tw/src/equipment-catalog.ts` — add `companion: true` to the 2 glia entries + `livingCompanionDefs()` / `livingCompanions(ownedIds)` helpers (rarest-first); `equipment-types.ts` — add optional `companion?: boolean` to `EquipmentDef` (additive); re-export from `index.ts`.
  - `apps/neurons-tw/src/components/MazeExpedition.tsx` — `useOwnedCompanions()` liveQuery hook + `companionSpriteUrl()` + append companion marchers to the band's `members` parade + a render branch (cyan-glia glow). No new component / no brain-map mount.
  - `packages/theme-pixel-neurons` — placeholder reuses the existing `equipment:<id>` static sprite; real animated frames deferred to the follow-up.
- **Schema/sync**: **NONE**. Derives purely from the already-synced `equipment` Dexie table — no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, no new adapter, no `SYNCED_META_KEYS` change. A second device computes identical companions from the same owned set.
- **Tests**: unit for the `companion`-subset predicate (owned glia → in set; owned structural item → excluded; cap honored); a render/smoke assertion that owned-glia mounts a companion sprite on both surfaces and non-glia does not.
- **Neuroscience**: no new claim — oligodendrocyte + astrocyte are already OE-anchored in the acceleration design (glia physically ensheath/associate with neurons = the in-universe reason they "follow you"). Any *future* new glial companion item must run `/oe` per project rule.
- **Out of scope / untouched**: acceleration passive math, DMN draw path, backpack/inventory, the equipment dex, schema/sync, medexam-tw, 二階. No IAP/real-money path.
