/**
 * Sprite registry — maps theme sprite keys to runtime URLs.
 *
 * Uses Vite's `?url` import suffix to bundle PNGs with cache-busting hashes
 * in production builds, while serving the raw file in dev.
 *
 * Generation pipeline: `pnpm --filter @study-rpg/theme-pixel-medical generate-sprites`
 * Spec: openspec/changes/add-character-and-sprites/specs/character-system/spec.md
 *
 * `Item.artKey` strings are the stable identity (don't break IndexedDB save files);
 * this map redirects each artKey to its renamed medical sprite per design.md
 * "artKey ↔ sprite key migration".
 */

import characterBase from '../sprites/character-base.png?url'
import characterBaseFemale from '../sprites/character-base-female.png?url'

// Slot placeholders
import slotHead from '../sprites/slot-placeholders/head.png?url'
import slotBody from '../sprites/slot-placeholders/body.png?url'
import slotWeapon from '../sprites/slot-placeholders/weapon.png?url'
import slotCharm from '../sprites/slot-placeholders/charm.png?url'

// Items (legacy artKey → medical sprite file)
import alpha1Adrenergic from '../sprites/items/alpha1-adrenergic.png?url'
import nmdaReceptor from '../sprites/items/nmda-receptor.png?url'
import gabaAReceptor from '../sprites/items/gaba-a-receptor.png?url'
import nsaid from '../sprites/items/nsaid.png?url'
import betaBlocker from '../sprites/items/beta-blocker.png?url'
import statin from '../sprites/items/statin.png?url'
import acetaminophen from '../sprites/items/acetaminophen.png?url'
import atropine from '../sprites/items/atropine.png?url'
import aspirin from '../sprites/items/aspirin.png?url'
import morphine from '../sprites/items/morphine.png?url'
import warfarin from '../sprites/items/warfarin.png?url'
import cox2 from '../sprites/items/cox-2.png?url'
import partialAgonist from '../sprites/items/partial-agonist.png?url'
import hmgCoaReductase from '../sprites/items/hmg-coa-reductase.png?url'
import cyclooxygenase from '../sprites/items/cyclooxygenase.png?url'
import digoxinWindow from '../sprites/items/digoxin-window.png?url'
import cytochromeP450 from '../sprites/items/cytochrome-p450.png?url'
import firstPassEffect from '../sprites/items/first-pass-effect.png?url'
import tolerance from '../sprites/items/tolerance.png?url'
import serotoninSyndrome from '../sprites/items/serotonin-syndrome.png?url'

export const SPRITE_MAP: Record<string, string> = {
  // Character variants
  'character-base': characterBase,
  'character-base-female': characterBaseFemale,

  // Slot placeholders (keys per spec Requirement: Four fixed equipment slots visible)
  'slot-placeholder-head': slotHead,
  'slot-placeholder-body': slotBody,
  'slot-placeholder-weapon': slotWeapon,
  'slot-placeholder-charm': slotCharm,

  // Items — keyed by legacy artKey (from items.ts), value = renamed medical sprite
  hairband: alpha1Adrenergic,
  goggles: nmdaReceptor,
  'graduation-cap': gabaAReceptor,
  scrubs: nsaid,
  whitecoat: betaBlocker,
  'gold-whitecoat': statin,
  pencil: acetaminophen,
  'reflex-hammer': atropine,
  stethoscope: aspirin,
  scalpel: morphine,
  'littmann-cardio': warfarin,
  notebook: cox2,
  'school-badge': partialAgonist,
  gauze: hmgCoaReductase,
  robbins: cyclooxygenase,
  'signed-pass': digoxinWindow,
  'hippocrates-charm': cytochromeP450,
  coffee: firstPassEffect,
  apple: tolerance,
  'senior-notes': serotoninSyndrome,
}
