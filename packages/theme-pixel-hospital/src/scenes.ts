/**
 * Scene registry — maps hospital tier (`tier1` / `tier2` / `tier3`) to scene PNG URLs.
 *
 * Generated via codex `gpt-image-2` per 2026-05-15 `add-hospital-home-pixel-scene` change.
 * Three full-art scenes (768×384, GBA-era pixel art, 16-color quantized) corresponding to:
 *   - tier1 = 診所
 *   - tier2 = 區域醫院
 *   - tier3 = 醫學中心
 *
 * Uses Vite's `import.meta.glob` with `?url`. Returns empty object if no scenes are generated yet —
 * caller (theme index.ts) decides whether to populate the optional `scenes` field.
 */

const sceneModules = import.meta.glob('../sprites/scenes/hospital-tier*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function extractTierKey(path: string): string {
  const match = path.match(/hospital-(tier\d+)-/)
  return match ? match[1] : ''
}

const sceneEntries = Object.entries(sceneModules)
  .map(([path, url]) => [extractTierKey(path), url] as const)
  .filter(([key]) => key)

export const SCENES_MAP: Record<string, string> = Object.fromEntries(sceneEntries)

export const HOSPITAL_SCENES: { tier1: string; tier2: string; tier3: string } | undefined =
  SCENES_MAP.tier1 && SCENES_MAP.tier2 && SCENES_MAP.tier3
    ? {
        tier1: SCENES_MAP.tier1,
        tier2: SCENES_MAP.tier2,
        tier3: SCENES_MAP.tier3,
      }
    : undefined
