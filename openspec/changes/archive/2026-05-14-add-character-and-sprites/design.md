## Design

### Sprite manifest（drives subagent + reproducibility）

`packages/theme-pixel-medical/scripts/sprites.manifest.json` — single source of truth for what sprites exist + what prompt produced each. Subagent reads this, fills in `sprites/` PNGs:

```jsonc
{
  "styleAnchor": "16-bit pixel art, GBA-era JRPG icon, 64x64 px center-cropped, NES-limited 16-color palette (cream parchment background #f4ecd8, deep brown outline #2d1f1a, hard pixel edges, NO gradients, NO anti-aliasing, NO drop shadow), Pokémon Emerald / Stardew Valley aesthetic, single object centered, no text, no border decoration",
  "negativePrompt": "blurry, photorealistic, gradient, anti-aliased, modern flat icon, glossy 3D, watercolor, text overlay, signature, frame border",
  "sprites": [
    {
      "key": "character-base",
      "filename": "character-base.png",
      "size": "384x384",
      "prompt": "front-facing pixel art portrait of a young East Asian medical student standing in a study room, white short-sleeve scrubs over a t-shirt, holding a notebook, neutral confident expression, brown short hair, light parchment background"
    },
    { "key": "hairband", "filename": "items/hairband.png", "size": "64x64", "prompt": "pixel art icon of a thin black hairband / headband, top-down 3/4 perspective" },
    // ... 20 items total, each tied to artKey in items.ts
  ]
}
```

### Subagent generation pipeline

1. Read this manifest
2. For each sprite, build CLI command:
   ```
   cdx image "<styleAnchor>. Subject: <sprite.prompt>. Constraints: <negativePrompt as anti-prompt>"
   ```
   (skill routes to codex CLI's `gpt-image-2` generator)
3. Save returned image to `packages/theme-pixel-medical/sprites/<filename>`
4. Smoke gate: generate first 3 (character-base + 2 representative items) → halt → write `/tmp/sprite-smoke-preview.html` showing them inline → SendMessage back to main thread with paths → wait for `continue` / `abort` instruction
5. On `continue`: generate remaining 18 in parallel batches of 3-5

### Character sprite rendering（in App.tsx）

```tsx
<div className="char-card">
  <div className="char-sprite-frame">
    <img src={theme.sprites['character-base']} alt={player.name} />
    <input value={player.name} onChange={...} />  // inline editable name
    <span className="lvl">Lv.{player.level}</span>
  </div>
  <EquipSlots equipment={player.equipment} catalog={theme.itemCatalog} sprites={theme.sprites} />
  <StatBars stats={player.stats} schema={STAT_SCHEMA} />
</div>
```

### Equip slot rendering

4 fixed slots displayed as 2×2 grid below character sprite. Each slot:
- Empty → 64×64 placeholder frame with slot icon (head silhouette / shirt / sword / charm)
- Occupied → 64×64 item sprite + rarity-colored 2px outline (`--rarity-<n>`)

Click empty slot → opens inventory filtered to that slot's items.
Click occupied slot → unequips (returns to inventory).

### Inventory grid

New page `/inventory` (react-router):
- 6-column grid of 64×64 item sprite tiles
- Each tile: sprite + rarity outline + (small) item.name on hover
- Click tile → equip to corresponding slot (replaces existing if slot occupied)
- Filter buttons: All / Head / Body / Weapon / Charm / Consumable

For MVP keep it on same page (modal or side panel) — separate route is M2 polish.

### Sprite asset structure

```
packages/theme-pixel-medical/sprites/
├── character-base.png           # 384x384 portrait
├── items/
│   ├── alpha1-adrenergic.png    # 64x64 (matches artKey "hairband" but new key)
│   ├── nmda-receptor.png
│   ├── ...
│   └── cytochrome-p450.png
└── slot-placeholders/
    ├── head.png                 # 64x64 grayed silhouette
    ├── body.png
    ├── weapon.png
    └── charm.png
```

### artKey ↔ sprite key migration

Current `items.ts` uses legacy artKey strings like `hairband`, `whitecoat`, `stethoscope` (from the original pre-rename catalog). These remain frozen for save-file compatibility; we add a **second** map at the theme level:

```ts
THEME_PIXEL_MEDICAL.sprites = {
  'character-base': '/sprites/character-base.png',
  'hairband': '/sprites/items/alpha1-adrenergic.png',     // artKey → sprite path
  'whitecoat': '/sprites/items/beta-blocker.png',
  // ...
  'slot-placeholder-head': '/sprites/slot-placeholders/head.png',
  // ...
}
```

So `artKey` continues to be the stable identity (don't break IndexedDB); the theme maps artKey → actual sprite URL. This decouples item data from theme assets — a future theme could supply different sprites for the same artKey.

### Decisions

#### 2026-05-14 — No paper-doll layering

LLM image gen (gpt-image-2) cannot reliably produce 4-layer pixel-aligned sprites for paper-doll body rendering. Each layer needs sub-pixel registration + identical perspective + transparent body slots in base. Practically impossible without a human pixel artist + Aseprite. Defer to M3+ if user wants this; MVP uses item icons in slot tiles instead.

#### 2026-05-14 — Manifest-driven, not ad-hoc prompts

Each sprite's prompt is committed to `sprites.manifest.json`. Reasons:
- Reproducibility: if a sprite needs regen, run script with same manifest entry
- Audit: future maintainer can see what prompt produced what image
- Style drift mitigation: shared `styleAnchor` prefix in every prompt anchors consistency

#### 2026-05-14 — 3-sprite smoke gate before full 21

Risk: 21 calls × bad vibe = 21 throwaway PNGs. Mitigation: subagent generates 3 (character + 2 items spanning N + UR rarity) → halts → SendMessage to main thread with preview → wait for "continue" / "abort". This is the standard "vibe-check" gate for any LLM batch run.

#### 2026-05-14 — Click-to-equip, no drag-drop

Drag-drop is friction in pixel-art UIs (especially mobile). Click slot → opens filtered inventory modal → click item to equip. Two clicks per equip swap. Matches JRPG menu UX (Pokémon item menu, FF, Stardew).
