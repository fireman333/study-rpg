/**
 * Maze tile atlas index (polish-neurons-maze-tileset).
 *
 * Maps named tiles → their {col,row} cell in maze-atlas.png (16×16 cells).
 * The atlas is authored by scripts/build-maze-atlas.mjs. The renderer
 * (components/maze/MazeGrid.tsx) blits these tiles behind its draw seam,
 * tinting the neutral fiber tiles per family at render time.
 */
import atlasUrl from './maze-atlas.png'

export const TILE_PX = 16

/**
 * Hashed asset URL of the committed atlas. Uses an ESM asset import (the
 * convention used by the achievements atlases) — `new URL(..., import.meta.url)`
 * is NOT reliably emitted by Vite from a module inside `src/assets/`.
 */
export const ATLAS_URL = atlasUrl

/** [col, row] of each tile in the 8×4 atlas grid. */
export const TILES = {
  // structural fiber (neutral / tintable) — row 0
  straightH: [0, 0],
  straightV: [1, 0],
  curve: [2, 0], // base orientation: connects E + S
  tee: [3, 0], // base: W + E + S (stem south)
  cross: [4, 0],
  cap: [5, 0], // base: stub from S
  weaveUnderH: [6, 0], // horizontal fiber gapped at center (dips under)
  weaveUnderV: [7, 0],
  // field — row 1 left
  bgTissue: [0, 1],
  fog: [1, 1],
  // hero glyphs — row 1
  node: [2, 1], // tintable near-white soma
  bouton: [3, 1], // cyan synaptic terminal
  core: [4, 1], // amber synaptic core
  portal: [5, 1], // cyan entry ring
  walker: [6, 1], // growth cone (tintable)
} as const

export type TileKey = keyof typeof TILES
