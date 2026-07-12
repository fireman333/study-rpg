/**
 * Pure helpers for the 考前講義 scene (enhance-neurons-anatomy-handout).
 *
 * The authored handout HTML is a sequence of `<section class="hdt-region" id="…">` blocks. The
 * scene splits it into region blocks ONCE per subject so it can (a) render a「測驗本章」CTA after
 * each mapped chapter and (b) drive a sidebar TOC + scroll-spy. Kept side-effect-free (DOMParser
 * only) so it is unit-testable under jsdom without mounting the portal scene.
 */
import type { HandoutChapterQuiz } from '@study-rpg/content-neurons-tw'

export interface ResolvedRegion {
  regionId: string
  /** true when the leaf lives in a multi-region (chapter-keyed) chapter — target is the chapter HEAD. */
  isChapter: boolean
}

/**
 * Resolve a concept leaf → its handout region for ONE subject (rescue 戰情圖 → 講義 deep-link,
 * add-neurons-handout-rescue-deeplink). Forward lookup over the subject's own `chapterQuizzes`; the
 * caller MUST pass only the selected subject's quizzes — a `leafId` is NOT unique across subjects,
 * so a global map would mis-jump. For a chapter-keyed chapter (`memberRegionIds.length > 1`) the
 * target is the chapter HEAD (`memberRegionIds[0]`), NOT `regionId` (which anchors the chapter-END
 * quiz CTA). Returns null when no chapter owns the leaf (e.g. a 送分/disputed-only leaf absent from
 * the recurrence-derived region config) — callers MUST treat null as "no section", never fall back
 * to region 0.
 */
export function resolveLeafToRegion(
  chapterQuizzes: HandoutChapterQuiz[] | undefined,
  leafId: string,
): ResolvedRegion | null {
  for (const cq of chapterQuizzes ?? []) {
    if (cq.leafIds.includes(leafId)) {
      return { regionId: cq.memberRegionIds[0] ?? cq.regionId, isChapter: cq.memberRegionIds.length > 1 }
    }
  }
  return null
}

/**
 * Two-segment (subject, leaf) resolution outcome for a `?leaf=` deep-link (neurons-unit-correspondence).
 *  - `anchor`   — the leaf has a primary topic sub-anchor in the rendered subject → scroll to it.
 *  - `region`   — no anchor, but the leaf maps to a region in this subject → scroll to that region.
 *  - `unavailable` — no anchor and no region (cross-subject leak / 送分 / disputed) → inline note.
 */
export type LeafResolution =
  | { kind: 'anchor'; anchorId: string }
  | { kind: 'region'; regionId: string; isChapter: boolean }
  | { kind: 'unavailable' }

/**
 * Find a leaf's PRIMARY topic sub-anchor id in the currently-rendered handout DOM. Subject-scoped BY
 * CONSTRUCTION — the scene renders only the active subject, so the `[data-leaf-ids~="…"]` query can
 * never cross subjects (a `leafId` is NOT unique across subjects; 68 are shared). Returns the element
 * id or null. DOM-dependent (jsdom / browser); returns null with no DOM. The `~=` selector matches a
 * whitespace-separated token, so a multi-value `data-leaf-ids` resolves the right topic.
 */
export function findLeafAnchorId(
  leafId: string,
  root: ParentNode | null = typeof document === 'undefined' ? null : document,
): string | null {
  if (!root || !leafId) return null
  try {
    // leafIds are `[a-z0-9-]` slugs; escape defensively so an unexpected char can't break the selector.
    const el = root.querySelector(`[data-leaf-ids~="${leafId.replace(/["\\]/g, '\\$&')}"]`) as HTMLElement | null
    return el?.id || null
  } catch {
    return null
  }
}

/**
 * Two-segment `(subject, leaf)` resolver for the handout `?leaf=` deep-link. Cascade:
 *   1. leaf's primary topic anchor (DOM, subject-scoped)  →
 *   2. leaf's region (resolveLeafToRegion over the SUBJECT'S OWN chapterQuizzes)  →
 *   3. unavailable.
 * NEVER a global `leafId → anchor` map. `findAnchor` is injected (defaults to `findLeafAnchorId`) so
 * the cascade is unit-testable under the `node` test env (no DOMParser). Callers MUST treat
 * `unavailable` as "no section" — never a region 0 / subject 0 fallback.
 */
export function resolveLeafTarget(
  leafId: string,
  chapterQuizzes: HandoutChapterQuiz[] | undefined,
  findAnchor: (leafId: string) => string | null = findLeafAnchorId,
): LeafResolution {
  const anchorId = findAnchor(leafId)
  if (anchorId) return { kind: 'anchor', anchorId }
  const region = resolveLeafToRegion(chapterQuizzes, leafId)
  if (region) return { kind: 'region', regionId: region.regionId, isChapter: region.isChapter }
  return { kind: 'unavailable' }
}

export interface HandoutRegion {
  id: string
  /** Heading text WITH its authored leading emoji (as shown in-content). */
  title: string
  /** The region's own `outerHTML` — re-rendered verbatim, nothing dropped between regions. */
  html: string
}

export interface HandoutTocEntry {
  id: string
  /** Heading text with the leading emoji stripped, for a calmer docs-style nav label. */
  title: string
}

/**
 * Strip a leading run of emoji / pictographic symbols (and their ZWJ/variation selectors) from a
 * navigation label. In-content headings keep their emoji; only the TOC label is calmed.
 */
export function stripLeadingEmoji(label: string): string {
  return label.replace(/^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍\s]+/u, '').trim()
}

/** Split authored handout HTML into its `.hdt-region` blocks (empty on SSR / parse failure). */
export function deriveRegions(html: string): HandoutRegion[] {
  if (typeof window === 'undefined' || !html) return []
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return [...doc.querySelectorAll('.hdt-region')].map((s) => ({
      id: (s as HTMLElement).id,
      title: s.querySelector('.hdt-region__head')?.textContent?.trim() || (s as HTMLElement).id,
      html: (s as HTMLElement).outerHTML,
    }))
  } catch {
    return []
  }
}

/** Derive TOC entries (emoji-stripped labels) from already-parsed regions. */
export function deriveToc(regions: HandoutRegion[]): HandoutTocEntry[] {
  return regions.map((r) => ({ id: r.id, title: stripLeadingEmoji(r.title) }))
}
