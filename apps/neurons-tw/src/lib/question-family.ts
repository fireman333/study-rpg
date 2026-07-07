/**
 * Reclassified-family annotation helper (annotate-reclassified-question-family).
 *
 * A question's raw `id` embeds the ORIGINAL 考選部 exam-section subject
 * (`<year>-<session>-<book>-<subject>-Q<n>`, e.g. `114-2-醫學二-公共衛生學-Q26`),
 * but the build reclassifies many questions into a different science family stored
 * on `q.subject` (the field shown as the 科別 tag). The `id` is the stable key for
 * questionHistory / bookmarks / variants and cannot change, so a reclassified
 * question shows a correct family tag (e.g. 免疫學) while its 題號 string still reads
 * a different subject (公共衛生學). Users misread this as a mislabel and file
 * false-alarm bug reports. Surfacing the actual family right at the 題號 line makes
 * the mismatch read as intentional.
 *
 * Pure + unit-tested; never throws on malformed ids.
 */

/**
 * Returns the actual family (`subject`) when the id-embedded subject differs from it
 * and the difference is worth annotating, else `null`.
 *
 * The 微生物暨免疫學 → 微生物學 / 免疫學 case is the EXPECTED micro/immuno split and is
 * NOT annotated. A malformed id (fewer than 5 hyphen-segments, or a falsy subject
 * segment) yields `null`.
 */
export function reclassifiedFamily(id: string, subject: string): string | null {
  const parts = id.split('-')
  if (parts.length < 5) return null
  const idSubject = parts[3]
  if (!idSubject) return null
  if (idSubject === subject) return null
  // Expected micro/immuno split from the combined 微生物暨免疫學 exam section — not confusing.
  if (idSubject === '微生物暨免疫學' && (subject === '微生物學' || subject === '免疫學')) {
    return null
  }
  return subject
}
