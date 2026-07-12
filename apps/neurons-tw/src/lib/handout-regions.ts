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
