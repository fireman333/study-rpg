## Why

Roadmap M6 (Social light) carries a deferred line: 「公開分享角色卡 OG image」. Item A (#4) of `openspec/decisions/2026-06-02-neurons-pikmin-next-session.md` promotes it to the next change — make a player's connectome / representative variants into a **shareable character card**. Today neurons-tw has **zero** share / OG / canvas-export code (greenfield); the only social surface is the opt-in leaderboard.

This is the **Pikmin-Bloom step「炫耀」** layer: after collecting variants (圖鑑), seeing their birth-context (provenance + decor), the player gets a single artifact they can save and post. All the card's data already lives client-side in existing Dexie tables — so v1 needs **no backend and no schema change**, which also keeps this lane from colliding on Dexie/R2 version numbers with the parallel collection-rework lane.

## What Changes

- **New capability `neurons-character-card`**: a pure client-side render of the player's stats + representative variants to a single PNG, generated on demand and exported via download / Web Share.
- **Data layer** — a `buildCharacterCardPayload()` aggregates already-stored local state (per-family AP, strong-synapse count, collected variants X/55 + families-complete X/11, total study minutes, nickname + selected title) plus a pure `pickBranchRepresentatives()` that picks one representative neuron per NT branch (DA / 5HT / GABA / Glu).
- **Render layer** — `renderCharacterCard(ctx, payload, assets)` draws the card with the native **Canvas 2D API** (no new dependency): neurons cream/signal palette, NT-branch colour accents, pixel sprites (`drawImage` of the existing plain-URL variant PNGs), Cubic 11 font with Noto Sans TC fallback. Sprites/font are preloaded before draw; any missing asset degrades gracefully (skip / placeholder), never a broken card.
- **Export layer** — `canvas.toBlob()` → download via `<a download>`, plus a `navigator.share({ files })` path on capable devices (progressive enhancement).
- **UI** — a single share entry (location is a GATE-1 decision) opening a `ShareCardModal` that previews the rendered card and offers 下載 / 分享.
- **Privacy** — the card is built 100% locally and only leaves the device when the player explicitly downloads/shares it (inherently opt-in by the share action). No account identifier (email / user_id) is ever drawn. Nickname is optional with a neutral fallback.
- **(Optional, secondary)** a **static generic** `og:image` + OG meta in `index.html` for the app's social link preview — NOT a per-player dynamic image (that needs a backend, see Out of Scope).

## Capabilities

### New Capabilities
- `neurons-character-card`: client-side render of a player's stats + per-branch representative variants to a downloadable / shareable PNG, with graceful asset degradation, no account identifiers on the card, and no backend / Dexie / R2 footprint.

### Modified Capabilities
<!-- none -->

## Impact

- **App (new files)** `apps/neurons-tw/src/lib/services/character-card.ts` (payload aggregation + pure `pickBranchRepresentatives`), `apps/neurons-tw/src/lib/character-card-render.ts` (Canvas 2D draw + asset preload), `apps/neurons-tw/src/lib/character-card-export.ts` (toBlob → download / Web Share), `apps/neurons-tw/src/components/ShareCardModal.tsx`, plus a small share-entry control.
- **App (edits)** one mount point for the share entry (header `App.tsx` or `/leaderboard` page — GATE-1 decision); `apps/neurons-tw/index.html` only if the optional static og:image is included.
- **Reads only** from existing Dexie tables (`familyAccrual` / `neuronVariants` / `synapses` / `leaderboardProfile` / `meta`) and existing services (`representatives.ts`, `reading-timer.readTotalStudyMinutes`, `neurons-leaderboard`). Sprite URLs via `theme-pixel-neurons` `SPRITE_MAP` (already plain PNG URLs → canvas-drawable).
- **Tests** `apps/neurons-tw/src/__tests__/character-card.test.ts` — pure payload + representative-selection + fallback logic.
- **No** Dexie `.version()` bump, **no** R2 bundle `SCHEMA_VERSION` bump, **no** new sync adapter, **no** new synced state, **no** backend. The card is a pure derived view of already-local data.
