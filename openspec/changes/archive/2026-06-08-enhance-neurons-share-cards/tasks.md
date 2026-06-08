## 1. Payload builders + selection helpers (lib/services/character-card.ts)

- [x] 1.1 `buildVariantCardPayload(featuredVariantId?)` — resolve the featured variant (default = rarest collected, tiebreak most-recent `rolledAt`), assemble sprite key + displayName + rarity + family + birth-context caption from local state
- [x] 1.2 `buildConnectorCardPayload(featuredPairKey?)` — resolve the featured connector (default = most-recently unlocked), assemble connector sprite key + the two families + `connectorColors(pairKey)` from local state
- [x] 1.3 Picker list helpers: collected variants (for 變體 picker) + unlocked connectors (for 連結 picker), plus the default-selection helpers (`pickDefaultVariant` / `pickDefaultConnector`)
- [x] 1.4 Empty-state payloads (zero variants / zero connectors) that render a CTA, never throw

## 2. Card renderers (lib/character-card-render.ts)

- [x] 2.1 `renderVariantCard(ctx, payload, assets)` at 1080×1350 — variant sprite + displayName + rarity badge + family + caption
- [x] 2.2 `renderConnectorCard(ctx, payload, assets)` — connector sprite (procedural split-color fallback when no sprite) + the two family names + split-color frame
- [x] 2.3 Asset preload for the new cards (sprite + pixel font; missing sprite → empty slot, font failure → CJK fallback — same graceful-degradation discipline as the stats card)

## 3. Share hub modal (components/ShareCardModal.tsx + routes/CollectionPage.tsx)

- [x] 3.1 Segmented control [變體 | 連結 | 戰績], default 變體; tab state drives which payload builder + renderer runs
- [x] 3.2 Per-acquisition-tab in-modal item picker (horizontal strip of collected variants / unlocked connectors); selecting one re-renders the featured card; only one canvas rendered at a time
- [x] 3.3 Wire download / Web Share via the unchanged `character-card-export.ts` for whichever card is featured
- [x] 3.4 Empty/CTA states for 變體 / 連結 when nothing collected/unlocked; loading + export-result states surfaced (never silently dropped)
- [x] 3.5 Update the `/collection` entry label/wiring (角色卡 → share hub)
- [x] 3.6 Render the modal via `createPortal(document.body)` — fixes a pre-existing positioning bug where the `/collection` route's motion-wrapper transform broke the overlay's `position: fixed` (off-screen when scrolled); the identical overlay shipped in the original og-share modal had the same latent bug

## 4. Tests + verification

- [x] 4.1 Vitest: default variant = rarest (tiebreak most-recent roll); default connector = most-recent unlock; empty-state payloads return a CTA shape
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw typecheck` + Chrome MCP on `/collection`: open hub → switch 變體/連結/戰績 → pick items → download a PNG → console clean; verify zero Dexie/R2 schema bump
