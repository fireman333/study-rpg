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

// Context-driven decor overlays — transparent-bg PNGs composited onto any base
// variant sprite per provenance (context-driven-variant-art) + flavoured per NT
// branch (add-neurons-per-branch-decor). Filename → key: universal `<type>.png`
// → `decor:<type>` (e.g. `redemption.png` → `decor:redemption`); per-branch
// `<type>-<branch>.png` → `decor:<type>:<branch>` (the single `-` becomes `:`,
// e.g. `redemption-da.png` → `decor:redemption:da`). Type + branch ids contain
// no `-`, so the split is unambiguous. Missing keys default to TRANSPARENT_PIXEL
// (no broken-image icon; "no asset" renders as "no decor"). See `../SPRITE_GENERATION.md`.
const decorSpriteModules = import.meta.glob('../sprites/decor/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const decorSprites: Record<string, string> = Object.fromEntries(
  Object.entries(decorSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`decor:${stem.replace('-', ':')}`, url]
  }),
)

// Permanent equipment sprites (add-neurons-acceleration-system). Real art landed
// via `generate-acceleration-sprites`; any equipmentId without a PNG still falls
// back to TRANSPARENT_PIXEL. Filename → key:
// `<equipmentId>.png` → `equipment:<equipmentId>`.
const equipmentSpriteModules = import.meta.glob('../sprites/equipment/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const equipmentSprites: Record<string, string> = Object.fromEntries(
  Object.entries(equipmentSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`equipment:${stem}`, url]
  }),
)

// Dedicated living-companion marcher sprites (generate-companion-sprites):
// `<equipmentId>.png` → `companion:<equipmentId>`. ONLY present files are keyed
// (spread into SPRITE_MAP below — no hardcoded TRANSPARENT_PIXEL keylist) so a
// missing sprite leaves the key unresolved and the expedition band's
// `companion:<id> ?? equipment:<id>` fallback still fires.
const companionSpriteModules = import.meta.glob('../sprites/companion/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const companionSprites: Record<string, string> = Object.fromEntries(
  Object.entries(companionSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`companion:${stem}`, url]
  }),
)

// Connector neuron sprites (add-neurons-connector-neuron-family). Placeholder this
// change — NO PNGs ship; the collection page renders a PROCEDURAL split-color card
// when no sprite is present. Real 55-pair art via a follow-up
// `generate-connector-sprites` change. Expected filename `<familyA>__<familyB>.png`
// (two subject ids, `__`-separated — avoids `|` in filenames) → key
// `connector:<a|b>` (sorted, `|`-joined — matches the synapse/connector pairKey).
// ONLY present files are keyed (spread present-only into SPRITE_MAP) so a missing
// sprite leaves the key unresolved and the consumer's procedural fallback fires.
const connectorSpriteModules = import.meta.glob('../sprites/connectors/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const connectorSprites: Record<string, string> = Object.fromEntries(
  Object.entries(connectorSpriteModules).map(([path, url]) => {
    const stem = path.replace(/.*\/(.+)\.png$/, '$1')
    const [a, b] = stem.split('__')
    const pairKey = a && b ? [a, b].sort().join('|') : stem
    return [`connector:${pairKey}`, url]
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

// neuron-variant-gacha pyramid keys (11 families × 10 slots 0..9 = 110,
// expand-neuron-variant-catalog). slot 0 = P0 apex; slots 1-9 = the pyramid tiers
// (P5/P4/P3/P2/P1 + the slot-6/7/8/9 mid-tier deepening) — all real art. Each maps
// to the real glob'd sprite if the file is present, else TRANSPARENT_PIXEL. The
// theme can't import the content catalog (cyclic dep) so the slot span is hardcoded;
// the consumer also falls back to variant:default for any unmapped key, so a future
// non-uniform pyramid still degrades gracefully.
const VARIANT_ART_KEYS: string[] = []
for (const subjectId of SUBJECT_IDS) {
  for (let slot = 0; slot <= 9; slot += 1) {
    VARIANT_ART_KEYS.push(`variant:${subjectId}:${slot}`)
  }
}

// DMN fate-card placeholder keys (22 cards + 1 shared card back = 23;
// add-neurons-acceleration-system: streak-shield removed, surge + bolus added).
// Real artwork deferred to a follow-up generate change. Keys MUST stay in sync
// with DMN_CARD_CATALOG in @study-rpg/content-neurons-tw (cardId →
// 'dmn:card:<cardId>'). Hardcoded here to avoid a cyclic dep on the content pack.
const DMN_CARD_IDS = [
  // P1
  'dmn-default-mode-awakening-p1',
  'dmn-stream-of-consciousness-p1',
  // P2
  'dmn-hippocampal-ripples-p2',
  'dmn-mpfc-reverberation-p2',
  'dmn-rem-pruning-p2',
  'dmn-locus-coeruleus-burst-p2',
  'dmn-lactate-shuttle-p2',
  // P3
  'dmn-angular-association-p3',
  'dmn-daydream-drift-p3',
  'dmn-dln-switch-p3',
  'dmn-resting-state-ripple-p3',
  'dmn-spontaneous-discharge-p3',
  'dmn-dopamine-gain-p3',
  'dmn-astrocyte-fuel-p3',
  // P4
  'dmn-micro-mind-wander-p4',
  'dmn-mini-self-reference-p4',
  'dmn-posteromedial-pulse-p4',
  'dmn-brief-swr-p4',
  'dmn-noradrenaline-spray-p4',
  'dmn-glycogen-burst-p4',
  'dmn-cue-glimmer-p4',
  'dmn-premonition-glow-p4',
] as const

const DMN_ART_KEYS: string[] = [
  ...DMN_CARD_IDS.map((id) => `dmn:card:${id}`),
  'dmn:card-back',
]

// Permanent equipment art keys (12; add-neurons-acceleration-system). Hardcoded
// (cyclic-dep guard) to mirror EQUIPMENT_CATALOG; each maps to the real glob'd
// sprite if present, else TRANSPARENT_PIXEL (placeholder this change).
const EQUIPMENT_ART_KEYS = [
  // speed lane (myelin / conduction)
  'equipment:eq-fully-myelinated-axon-p1',
  'equipment:eq-saltatory-conduction-p2',
  'equipment:eq-oligodendrocyte-companion-p3',
  'equipment:eq-myelin-thickening-p3',
  'equipment:eq-node-of-ranvier-p4',
  'equipment:eq-single-myelin-wrap-p5',
  // energy lane (pump / metabolic)
  'equipment:eq-mitochondrial-powerhouse-p1',
  'equipment:eq-sodium-potassium-pump-p2',
  'equipment:eq-astrocyte-glycogen-p3',
  'equipment:eq-creatine-kinase-buffer-p3',
  'equipment:eq-lactate-reserve-p4',
  'equipment:eq-trace-glucose-p5',
] as const

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

// Decor overlays (universal `decor:<type>` + per-branch `decor:<type>:<branch>`,
// context-driven-variant-art + add-neurons-per-branch-decor) are NOT registered
// in SPRITE_MAP — they are resolved exclusively via `decorSpriteUrl`, which reads
// the globbed `decorSprites` map directly with a per-branch → universal → empty
// fallback. Keeping a single decor path (no parallel SPRITE_MAP entries) avoids
// drift.

export const SPRITE_MAP: Record<string, string> = Object.fromEntries([
  ...CORE_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  // Subject icons: real sprite if file present, else defensive fallback to placeholder
  ...SUBJECT_IDS.map((id) => [
    `subject:${id}`,
    subjectSprites[`subject:${id}`] ?? TRANSPARENT_PIXEL,
  ]),
  // NT-branch hub icons: real sprite if file present, else placeholder
  ...BRANCH_KEYS.map((k) => [k, branchSprites[k] ?? TRANSPARENT_PIXEL]),
  // (decor keys intentionally omitted — see decorSpriteUrl)
  // Root brain icon (central Neuron Connectome).
  ['root:brain', rootSprite ?? TRANSPARENT_PIXEL],
  ...ITEM_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...COSMETIC_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...SKILL_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  // Variant gacha: real sprite if file present, else defensive placeholder
  ...VARIANT_ART_KEYS.map((k) => [k, variantSprites[k] ?? TRANSPARENT_PIXEL]),
  // DMN fate-card sprites: real PNG if file present, else defensive placeholder
  ...DMN_ART_KEYS.map((k) => [k, cardSprites[k] ?? TRANSPARENT_PIXEL]),
  // Permanent equipment sprites: real PNG if file present, else placeholder
  ...EQUIPMENT_ART_KEYS.map((k) => [k, equipmentSprites[k] ?? TRANSPARENT_PIXEL]),
  // Dedicated companion marcher sprites — only PRESENT files keyed, so a missing
  // one stays unresolved and the band's `companion:<id> ?? equipment:<id>` fallback fires.
  ...Object.entries(companionSprites),
  // Connector neuron sprites — only PRESENT files keyed (none ship this change), so
  // a missing one stays unresolved and the collection card's procedural fallback fires.
  ...Object.entries(connectorSprites),
  // Animated hero sheets (variant:<family>:<slot>:<state>) — only present sheets registered.
  ...Object.entries(animatedSprites),
])

/**
 * Resolve a context-art decor texture URL with the per-branch → universal →
 * none fallback chain (add-neurons-per-branch-decor). `universalKey` is e.g.
 * `'decor:redemption'`; `branch` is the variant's NT branch (`'DA' | '5HT' |
 * 'GABA' | 'Glu'`, any case) or null. Returns the per-branch real asset if a
 * file is present, else the universal real asset if present, else the
 * transparent placeholder ("no asset" = "no visible field", never a broken
 * image). Consults `decorSprites` (real globbed files only), so a missing
 * texture at either level degrades gracefully.
 */
export function decorSpriteUrl(universalKey: string, branch: string | null): string {
  if (branch) {
    const perBranch = decorSprites[`${universalKey}:${branch.toLowerCase()}`]
    if (perBranch) return perBranch
  }
  return decorSprites[universalKey] ?? TRANSPARENT_PIXEL
}
