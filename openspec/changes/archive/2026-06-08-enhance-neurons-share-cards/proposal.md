## Why

The neurons share entry (`add-neurons-og-share`) renders a single stats-heavy "character card" — nickname + representative variants + a readout of AP / strong-synapse / collection / study-minute totals. A stats dump is the least shareable artifact the game produces: the moments players actually want to show off are **acquisitions** — "I just pulled this rare neuron" and "I bridged these two subjects". Now that the connector collectible (`add-neurons-connector-neuron-family`) and its art (`generate-connector-sprites`) have shipped, both acquisition card types are buildable. This is roadmap item #4 (`openspec/decisions/2026-06-08-connectome-conduction-roadmap.md`): pivot the shareable unit to acquisitions and demote the stats card.

## What Changes

- The existing `/collection`「🔗 分享角色卡」entry becomes a **share hub** — the modal gains a card-type switcher (segmented control) with three tabs: **變體 / 連結 / 戰績**, defaulting to 變體.
  - **變體 tab** (new): the player picks one collected variant (default = rarest, tiebreak most-recent roll) from an in-modal picker; the card renders that variant's sprite + displayName + rarity badge + family + birth-context caption. Any rarity is shareable (no rarity gate).
  - **連結 tab** (new): the player picks one unlocked connector; the card renders the bridge sprite + the two subject families + the split-color frame.
  - **戰績 tab** (demoted): the existing stats character card, now the third tab rather than the default/primary share.
- The acquisition moments themselves (`VariantUnlockModal`, connector unlock) are **not** touched — no share buttons added there this change.
- All three card types reuse the existing fully client-side Canvas 2D pipeline (`character-card-render.ts` 1080×1350 + `character-card-export.ts` PNG download / Web Share). Two new render functions + payload builders parallel the existing stats one.
- Empty states: no collected variants → 變體 tab shows an empty/CTA state; no unlocked connectors → 連結 tab shows empty/CTA. Never throws.

## Capabilities

### Modified Capabilities
- `neurons-character-card`: the "single share entry renders a character card" requirement becomes a **multi-type share hub** (變體 / 連結 / 戰績) with per-variant and per-connector cards plus the demoted stats card. All existing invariants carry over unchanged: fully client-side, no account identifier on the card, nickname optional, no leaderboard opt-in required, graceful degradation, and no backend / no Dexie `.version` bump / no R2 `SCHEMA_VERSION` bump / no new sync adapter (pure derived view of already-local data).

## Impact

- **Code (apps/neurons-tw only, `track-neurons`)**: `components/ShareCardModal.tsx` (tabs + per-tab picker), `lib/character-card-render.ts` (+ `renderVariantCard` / `renderConnectorCard`), `lib/services/character-card.ts` (+ variant/connector payload builders + selection helpers), `lib/character-card-export.ts` (reused as-is), `routes/CollectionPage.tsx` (entry label/wiring).
- **Tests**: Vitest for the new selection/payload logic (default-variant pick, empty states).
- **Zero schema/sync/backend**: no Dexie `.version` bump, no R2 `SCHEMA_VERSION` bump, no new sync adapter, no Worker/D1, no owner-dashboard action. Pure derived view of already-local, already-synced data.
- **Out of scope**: acquisition-moment share buttons (VariantUnlockModal / connector unlock unchanged); any backend per-player `og:image`; rarity-gated auto-popups.
