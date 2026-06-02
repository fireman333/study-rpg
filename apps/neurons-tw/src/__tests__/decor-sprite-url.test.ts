import { describe, it, expect } from 'vitest'
import { decorSpriteUrl } from '@study-rpg/theme-pixel-neurons'

/**
 * add-neurons-per-branch-decor §3 — decorSpriteUrl fallback chain:
 *   per-branch real asset → universal real asset → transparent placeholder.
 *
 * Fixture reality: the 3 universal decor PNGs (decor:redemption/milestone/elder)
 * plus all 12 per-branch PNGs (decor:<type>:<da|5ht|gaba|glu>) ship real files.
 * So a real branch resolves to its per-branch texture (distinct from the
 * universal); an UNKNOWN branch token (no matching file) falls back to the
 * universal; a type with no asset at all resolves to the transparent
 * placeholder (a data: URI — the only `data:` URL the resolver ever returns).
 */

const isPlaceholder = (url: string) => url.startsWith('data:')

describe('decorSpriteUrl — per-branch → universal → none fallback', () => {
  it('universal key with a real asset resolves to a real (non-placeholder) URL', () => {
    const url = decorSpriteUrl('decor:redemption', null)
    expect(url).toBeTruthy()
    expect(isPlaceholder(url)).toBe(false)
  })

  it('a real branch resolves to its per-branch texture, distinct from the universal', () => {
    const universal = decorSpriteUrl('decor:redemption', null)
    const da = decorSpriteUrl('decor:redemption', 'DA')
    expect(isPlaceholder(da)).toBe(false)
    expect(da).not.toBe(universal)
    // each branch resolves to its own distinct texture
    const urls = ['DA', '5HT', 'GABA', 'Glu'].map((b) => decorSpriteUrl('decor:milestone', b))
    expect(new Set(urls).size).toBe(4)
  })

  it('an unknown branch token falls back to the universal texture', () => {
    // No decor:redemption:zzz file → must equal the universal resolution.
    expect(decorSpriteUrl('decor:redemption', 'zzz')).toBe(decorSpriteUrl('decor:redemption', null))
  })

  it('branch case does not matter (lowercased internally)', () => {
    expect(decorSpriteUrl('decor:redemption', 'gaba')).toBe(decorSpriteUrl('decor:redemption', 'GABA'))
  })

  it('no asset at either level resolves to the transparent placeholder', () => {
    expect(isPlaceholder(decorSpriteUrl('decor:nonexistent', null))).toBe(true)
    expect(isPlaceholder(decorSpriteUrl('decor:nonexistent', 'DA'))).toBe(true)
  })
})
