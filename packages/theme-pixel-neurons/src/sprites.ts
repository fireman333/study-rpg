/**
 * Sprite registry — maps theme sprite keys to runtime URLs.
 *
 * Subject icons (11 neuron families): REAL sprites generated via Gemini MCP per
 * `generate-neurons-sprites` change (2026-05-25). See `../SPRITE_GENERATION.md`
 * for prompts + regen procedure.
 *
 * DMN fate-card sprites (20 cards + 1 shared card-back): REAL sprites generated
 * via Gemini MCP per `generate-dmn-card-artworks` change (2026-05-28). See
 * `../CARD_SPRITE_GENERATION.md` for prompts + regen procedure.
 *
 * Variant gacha sprites (55 = 11 families × 5 slots): REAL sprites generated via
 * codex CLI per `generate-neuron-variant-sprites` change (2026-05-30). See
 * `../SPRITE_GENERATION.md` for prompts + regen procedure. The `variant:default`
 * terminal fallback stays a 1×1 transparent placeholder.
 *
 * All bundled via Vite `import.meta.glob` with `?url` for cache-busting hash
 * URLs in production.
 *
 * Other categories (core scaffold / items / cosmetics / skill placeholders)
 * still map to a 1×1 transparent PNG until their respective consumer
 * capabilities ship real assets in separate future changes.
 *
 * theme-pack-contract MUST-cover keys: character-base, slot-placeholder-{head,
 * body,weapon,charm}, plus every Item.artKey in itemCatalog. Engine boots cleanly
 * with placeholders (no broken-image icons; per contract "missing key" scenario).
 */

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// Real subject sprites — Vite glob handles UTF-8 Chinese filenames cleanly
// per `theme-pixel-hospital/sprites/doctor-內科-P3.png` proven precedent.
const subjectSpriteModules = import.meta.glob('../sprites/subjects/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const subjectSprites: Record<string, string> = Object.fromEntries(
  Object.entries(subjectSpriteModules).map(([path, url]) => {
    const id = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`subject:${id}`, url]
  }),
)

// 4 NT-branch hub icons (DA / 5HT / GABA / Glu). Same glob pattern as subjects.
const branchSpriteModules = import.meta.glob('../sprites/branches/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const branchSprites: Record<string, string> = Object.fromEntries(
  Object.entries(branchSpriteModules).map(([path, url]) => {
    // Filename pattern: `<nt>-icon.png` → key `branch:<nt>` (e.g. da-icon.png → branch:da)
    const stem = path.replace(/.*\/(.+)\.png$/, '$1').replace(/-icon$/, '')
    return [`branch:${stem}`, url]
  }),
)

// Root brain icon (central Neuron Connectome node). Single file.
const rootSpriteModules = import.meta.glob('../sprites/root/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const rootSprite: string | undefined = Object.values(rootSpriteModules)[0]

// DMN fate-card sprites — 20 individual cards + 1 shared card-back, generated
// via Gemini MCP per `generate-dmn-card-artworks` change (2026-05-28). See
// `../CARD_SPRITE_GENERATION.md` for prompts + regen procedure. Filenames map
// directly to cardId (English kebab-case), e.g. `dmn-mpfc-reverberation-p2.png`
// → key `dmn:card:dmn-mpfc-reverberation-p2`. The shared `card-back.png` →
// key `dmn:card-back`.
const cardSpriteModules = import.meta.glob('../sprites/cards/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const cardSprites: Record<string, string> = Object.fromEntries(
  Object.entries(cardSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    const key = stem === 'card-back' ? 'dmn:card-back' : `dmn:card:${stem}`
    return [key, url]
  }),
)

// Real variant gacha sprites — 55 files `<familyId>-<slotIndex>.png` generated
// via codex CLI per `generate-neuron-variant-sprites` change (2026-05-30). See
// `../SPRITE_GENERATION.md`. Filename maps to key `variant:<familyId>:<slotIndex>`;
// family IDs are Chinese and contain no `-`, so split on the LAST `-`.
const variantSpriteModules = import.meta.glob('../sprites/variants/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const variantSprites: Record<string, string> = Object.fromEntries(
  Object.entries(variantSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    const dash = stem.lastIndexOf('-')
    const familyId = stem.slice(0, dash)
    const slot = stem.slice(dash + 1)
    return [`variant:${familyId}:${slot}`, url]
  }),
)

// Animated hero sprite sheets — multi-state (idle/correct/evolve) horizontal sheets
// per `add-neurons-sprite-animation-slice`. Filename `<familyId>-<slot>-<state>.png`
// → key `variant:<familyId>:<slot>:<state>`. Parse from the tail (state, slot) so
// family IDs (Chinese, no `-`) join the remainder. Only the hero (藥理學-3) ships
// sheets in this slice; other variants stay static (consumer falls back).
const animatedSpriteModules = import.meta.glob('../sprites/animated/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const animatedSprites: Record<string, string> = Object.fromEntries(
  Object.entries(animatedSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    const parts = stem.split('-')
    const state = parts.pop()
    const slot = parts.pop()
    const familyId = parts.join('-')
    return [`variant:${familyId}:${slot}:${state}`, url]
  }),
)

// Context-driven decor overlays — 3 universal transparent-bg PNGs composited
// onto any base variant sprite per provenance (context-driven-variant-art).
// Filenames map directly: `redemption.png` → `decor:redemption`, etc. Until the
// real assets land the keys default to TRANSPARENT_PIXEL (no broken-image icon;
// "no asset" renders as "no decor"). See `../SPRITE_GENERATION.md`.
const decorSpriteModules = import.meta.glob('../sprites/decor/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const decorSprites: Record<string, string> = Object.fromEntries(
  Object.entries(decorSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`decor:${stem}`, url]
  }),
)

// 11 subject icon keys (matched to FAMILY_BY_SUBJECT in content-neurons-tw build.ts)
const SUBJECT_IDS = [
  '藥理學',
  '公共衛生學',
  '寄生蟲學',
  '組織學',
  '生物化學',
  '病理學',
  '免疫學',
  '解剖學',
  '生理學',
  '胚胎學',
  '微生物學',
] as const

// itemCatalog artKeys (must stay in sync with items.ts)
const ITEM_ART_KEYS = [
  'receptor-glu-generic',
  'receptor-ampa',
  'receptor-nmda',
  'receptor-gaba-b',
  'channel-na-v',
  'channel-k-v',
  'channel-ca-v-l',
  'channel-hcn',
  'nt-dopamine',
  'nt-serotonin',
  'nt-gaba',
  'nt-glutamate',
  'receptor-d2',
  'receptor-5ht2a',
  'receptor-m1',
  'receptor-mglur1',
  'mol-atp',
  'mol-glycine',
  'mol-bdnf',
  'mol-reelin',
] as const

// cosmetic artKeys (must stay in sync with cosmetics.ts)
const COSMETIC_ART_KEYS = [
  // head (soma) — 4
  'cosmetic-head-soma-newcomer-halo',
  'cosmetic-head-soma-pyramidal-crown',
  'cosmetic-head-soma-purkinje-arbor',
  'cosmetic-head-soma-cajal-retzius-blueprint',
  // body (dendrite) — 4
  'cosmetic-body-dendrite-sparse',
  'cosmetic-body-dendrite-bushy',
  'cosmetic-body-dendrite-fractal',
  'cosmetic-body-dendrite-spine-gold',
  // accessory (myelin) — 4
  'cosmetic-accessory-myelin-thin',
  'cosmetic-accessory-myelin-banded',
  'cosmetic-accessory-myelin-rainbow',
  'cosmetic-accessory-myelin-saltatory-aura',
  // held (vesicle) — 4
  'cosmetic-held-vesicle-clear',
  'cosmetic-held-vesicle-dense-core',
  'cosmetic-held-vesicle-glutamate-glow',
  'cosmetic-held-vesicle-rainbow-array',
  // background — 4
  'cosmetic-background-bg-plain-lab',
  'cosmetic-background-bg-connectome-map',
  'cosmetic-background-bg-gamma-oscillation',
  'cosmetic-background-bg-hebbian-firewall',
] as const

// skill tree placeholder keys (4 NT × 9 nodes = 36)
const SKILL_ART_KEYS: string[] = []
for (const nt of ['da', '5ht', 'gaba', 'glu'] as const) {
  for (let i = 1; i <= 9; i += 1) {
    SKILL_ART_KEYS.push(`skill-placeholder-${nt}-${i}`)
  }
}

// neuron-variant-gacha placeholder keys (11 families × 5 slots = 55)
// Real sprites deferred to a follow-up generate-neuron-variant-sprites change.
const VARIANT_ART_KEYS: string[] = []
for (const subjectId of SUBJECT_IDS) {
  for (let slot = 1; slot <= 5; slot += 1) {
    VARIANT_ART_KEYS.push(`variant:${subjectId}:${slot}`)
  }
}

// DMN fate-card placeholder keys (20 cards + 1 shared card back = 21).
// Real artwork deferred to follow-up generate-dmn-card-artworks change.
// Keys MUST stay in sync with DMN_CARD_CATALOG in @study-rpg/content-neurons-tw
// (cardId → 'dmn:card:<cardId>'). Hardcoded here to avoid cyclic dep on the
// content pack.
const DMN_CARD_IDS = [
  // P1
  'dmn-default-mode-awakening-p1',
  'dmn-stream-of-consciousness-p1',
  // P2
  'dmn-hippocampal-ripples-p2',
  'dmn-pcc-pulse-p2',
  'dmn-mpfc-reverberation-p2',
  'dmn-rem-pruning-p2',
  // P3
  'dmn-angular-association-p3',
  'dmn-daydream-drift-p3',
  'dmn-temporal-pole-anchor-p3',
  'dmn-dln-switch-p3',
  'dmn-resting-state-ripple-p3',
  'dmn-spontaneous-discharge-p3',
  // P4
  'dmn-micro-mind-wander-p4',
  'dmn-mini-self-reference-p4',
  'dmn-posteromedial-pulse-p4',
  'dmn-brief-swr-p4',
  'dmn-micro-context-guard-p4',
  'dmn-small-circuit-immunity-p4',
  'dmn-cue-glimmer-p4',
  'dmn-premonition-glow-p4',
] as const

const DMN_ART_KEYS: string[] = [
  ...DMN_CARD_IDS.map((id) => `dmn:card:${id}`),
  'dmn:card-back',
]

// Contract-required keys
const CORE_KEYS = [
  'character-base',
  'slot-placeholder-head',
  'slot-placeholder-body',
  'slot-placeholder-weapon',
  'slot-placeholder-charm',
  'dorm-default',
  'variant:default',
] as const

// 4 NT-branch hub keys — `branch:da` / `branch:5ht` / `branch:gaba` / `branch:glu`.
const BRANCH_KEYS = ['branch:da', 'branch:5ht', 'branch:gaba', 'branch:glu'] as const

// 3 context-driven decor overlay keys (context-driven-variant-art).
const DECOR_KEYS = ['decor:redemption', 'decor:milestone', 'decor:elder'] as const

export const SPRITE_MAP: Record<string, string> = Object.fromEntries([
  ...CORE_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  // Subject icons: real sprite if file present, else defensive fallback to placeholder
  ...SUBJECT_IDS.map((id) => [
    `subject:${id}`,
    subjectSprites[`subject:${id}`] ?? TRANSPARENT_PIXEL,
  ]),
  // NT-branch hub icons: real sprite if file present, else placeholder
  ...BRANCH_KEYS.map((k) => [k, branchSprites[k] ?? TRANSPARENT_PIXEL]),
  // Decor overlays: real PNG if file present, else transparent placeholder
  ...DECOR_KEYS.map((k) => [k, decorSprites[k] ?? TRANSPARENT_PIXEL]),
  // Root brain icon (central Neuron Connectome).
  ['root:brain', rootSprite ?? TRANSPARENT_PIXEL],
  ...ITEM_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...COSMETIC_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...SKILL_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  // Variant gacha: real sprite if file present, else defensive placeholder
  ...VARIANT_ART_KEYS.map((k) => [k, variantSprites[k] ?? TRANSPARENT_PIXEL]),
  // DMN fate-card sprites: real PNG if file present, else defensive placeholder
  ...DMN_ART_KEYS.map((k) => [k, cardSprites[k] ?? TRANSPARENT_PIXEL]),
  // Animated hero sheets (variant:<family>:<slot>:<state>) — only present sheets registered.
  ...Object.entries(animatedSprites),
])
