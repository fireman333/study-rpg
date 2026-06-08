## Context

`add-neurons-og-share` shipped one share entry on `/collection` → `ShareCardModal` → a stats "character card" (1080×1350 Canvas 2D, `character-card-render.ts` + `character-card-export.ts`, pure-derived, no backend/Dexie/R2). The connector collectible + its 55 sprites now exist, so per-variant and per-connector cards are both buildable from already-local data. This change reshapes the share entry into a 3-type hub without touching the acquisition modals or adding any stored/synced state.

## Goals / Non-Goals

**Goals:**
- One share entry → hub with 變體 / 連結 / 戰績 tabs (default 變體).
- Per-variant card (any rarity) + per-connector card, both client-side PNG export.
- Demote the stats card to the 戰績 tab.
- Reuse the existing Canvas 2D render + export pipeline; preserve every invariant (no account id, nickname optional, no leaderboard opt-in, graceful degradation, no backend/Dexie/R2).

**Non-Goals:**
- Share buttons on `VariantUnlockModal` / connector unlock (acquisition moments unchanged).
- Backend per-player `og:image`; rarity-gated auto-popups.

## Decisions

- **D1 — Hub in the existing modal (owner-locked).** `ShareCardModal` gains a segmented control [變體 | 連結 | 戰績], default 變體. The `/collection`「分享」button is the single entry; the modal switches card type internally. No second entry point, no acquisition-moment hooks.
- **D2 — Any rarity shareable; default-featured variant = rarest, tiebreak most-recent roll (owner-locked: any rarity).** The 變體 tab has an in-modal picker over the player's collected variants; the initially-featured one is the rarest (tiebreak latest `rolledAt`) so the card opens on the player's best pull, but they can switch to any collected variant.
- **D3 — Stats card demoted to 戰績 tab (owner-locked).** The existing stats character card becomes the third tab, not the default. Its render path (`renderCharacterCard` + `buildCharacterCardPayload`) is unchanged — only its placement/priority changes.
- **D4 — Reuse the render pipeline.** Add `renderVariantCard(ctx, payload, assets)` and `renderConnectorCard(ctx, payload, assets)` alongside `renderCharacterCard`, all at 1080×1350, exported via the unchanged `character-card-export.ts`. Variant card shows sprite + displayName + rarity badge + family + birth-context caption (reuse `variant-caption` / `variant-decor`). Connector card shows the connector sprite + the two subject families + the split-color frame (reuse `connectorColors` / the `connector:<pairKey>` sprite key).
- **D5 — In-modal item picker per acquisition tab.** A horizontal strip of the player's collected variants (變體) / unlocked connectors (連結); tapping one re-renders the card for that item. Default selection per D2 (variant) and most-recent unlock (connector).
- **D6 — Zero new state.** Everything derives from already-local Dexie (`neuronVariants`, `connectorNeurons`, `leaderboardProfile`) + theme sprites. No Dexie `.version` bump, no R2 `SCHEMA_VERSION` bump, no sync adapter — same invariant the capability already requires.
- **D7 — Portal the modal to `document.body`.** The verify pass found the `/collection` route sits inside a motion-wrapper `<div>` with a settled non-identity `transform`, which makes the overlay's `position: fixed` resolve against that tall ancestor instead of the viewport — so the modal landed off-screen (~document-y 2098) whenever the page was scrolled. The original og-share modal shipped the identical overlay and carried the same latent bug. `createPortal(overlay, document.body)` escapes the transformed ancestor so the overlay always centers in the viewport. Pure presentation fix, scoped to this modal.

## Risks / Trade-offs

- **Large collections → picker length.** A player with many variants gets a long picker strip; cap/scroll the strip and lazy-render only the featured card (one canvas at a time), not a card per item.
- **Connector card frame parity.** The connector card's split-color frame should read consistently with the `/collection` connector card; reuse `connectorColors(pairKey)` so the two stay in sync.
- **Empty states.** New players have zero connectors (and possibly zero variants); each acquisition tab must render an empty/CTA state, never a thrown error or blank canvas — same graceful-degradation discipline the stats card already guarantees.
- **Modal complexity.** Three card types + two pickers in one modal grows `ShareCardModal`; keep each card type's payload builder + render fn isolated so the modal is just tab state + a switch.
