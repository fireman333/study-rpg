## Design

### Type extension

```ts
// packages/core/src/types.ts
export interface Player {
  // ... existing fields
  /** Theme sprite key for the player's character portrait. Default 'character-base' (male). */
  characterSpriteKey?: string
}
```

Optional, so existing serialized players (from before this change) read back fine. `App.tsx` resolves the sprite via:

```ts
const charKey = player.characterSpriteKey ?? 'character-base'
const charSprite = theme.sprites[charKey] ?? theme.sprites['character-base']
```

Second fallback (`theme.sprites['character-base']`) handles the case where a theme doesn't ship the alternate variant — engine never breaks because a theme is incomplete.

### Sprite prompt parity

Female sprite prompt must match the male's style anchor + setting to keep visual consistency. Manifest entry:

```jsonc
{
  "key": "character-base-female",
  "filename": "character-base-female.png",
  "size": "384x384",
  "prompt": "front-facing pixel art portrait of a young East Asian female medical student standing in a study room, white short-sleeve scrubs over a t-shirt, holding a notebook, neutral confident expression, long black hair tied back, light parchment background, cozy lamp + bookshelf + plants visible behind"
}
```

Identical to male prompt except: "young East Asian medical student" → "young East Asian female medical student", "brown short hair" → "long black hair tied back". Background description repeated verbatim to anchor scene continuity.

### Toggle UI

Minimal — two small arrow buttons flanking the character sprite. Click ◀ or ▶ cycles through `[characterSpriteKey: 'character-base', 'character-base-female']`. Generic enough to extend to N variants later without UI surgery.

```tsx
const VARIANTS = ['character-base', 'character-base-female']  // ordered cycle

function cycleVariant(direction: 1 | -1) {
  const current = player.characterSpriteKey ?? VARIANTS[0]
  const idx = VARIANTS.indexOf(current)
  const next = VARIANTS[(idx + direction + VARIANTS.length) % VARIANTS.length]
  setPlayer((p) => ({ ...p, characterSpriteKey: next }))
}
```

Place buttons absolutely-positioned over the character sprite frame's left/right edges. Hover opacity 0.6 → 1.0 (only allowed alpha use because it's transient hover state, not gameplay UI).

### Variant list location

Hard-coded in App.tsx for MVP. Future: move to `ThemePack.characterVariants?: string[]` so themes declare their own variant lineup. Defer to M3+ when we have ≥ 3 themes / variants.

### Decisions

#### 2026-05-14 — `characterSpriteKey` field, not `gender` enum

A `gender: 'male' | 'female'` field bakes binary semantics into the data model. `characterSpriteKey: string` is generalizable — adding skin tones, hair, accessories, non-binary representations later doesn't require a type migration. The semantic intent ("character variant") is decoupled from any social-category enum.

#### 2026-05-14 — Cycle UI, not picker modal

For MVP with 2 variants, two arrow buttons is the minimal UX. A picker modal makes sense at ≥ 4 variants; ship the cycle now, evolve later.

#### 2026-05-14 — Sprite prompt anchored on male's prompt

Use the male sprite prompt verbatim as base, swap only gender-coded descriptors. This minimizes style drift between the two variants. Same background, same lighting, same pose — only the subject differs. Reduces "two sprites that don't look like they belong in the same game" risk.
