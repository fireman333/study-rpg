/**
 * rejoinHardWrappedLines — pure, deterministic rejoin of PDF-column hard-wrapped
 * prose lines in 陽明 詳解 (e.g. `增加合\n成` → `增加合成`, `作⽤機\n制` → `作⽤機制`).
 *
 * The paginated source broke long lines at the PDF column width; `_extracted`
 * kept those `\n`, so `white-space: pre-wrap` renders them as mid-sentence /
 * mid-word breaks ("跑版"). This restores continuous prose.
 *
 * WHITESPACE-ONLY: the ONLY edit is removing a wrap newline (the two lines are
 * concatenated with no inserted character). An ASCII↔ASCII boundary is left
 * BROKEN (we can't tell a split word `topira|mate`→`topiramate` from a word
 * boundary `suppress|appetite`→`suppress appetite`, so we never guess). No
 * content character is ever added, removed, or altered.
 * Invariant (enforced by verify-normalize.ts): stripping ALL whitespace from the
 * input equals stripping ALL whitespace from the output, for every explanation.
 *
 * A break is removed (the two lines fused) only when ALL hold:
 *   - prev line visual width ≥ WRAP_MIN_WIDTH (a real PDF wrap, not a short
 *     deliberate line / header / table cell / single-char vertical run); AND
 *   - prev does NOT end with sentence-final punctuation / closing bracket / a
 *     URL / a citation page token; AND
 *   - next does NOT begin a new structural item (list/enum/bullet marker, ref /
 *     section-label heading, "Word –" sub-heading, URL); AND
 *   - neither line is a separator (──── rule); AND
 *   - NOT both lines CJK-free (a Latin/figure-label/citation/flattened-table run —
 *     Chinese 詳解 prose virtually never spans multiple all-Latin lines).
 *
 * Flattened CJK TABLES are excluded at the QUESTION level by build.ts: a question
 * that owns table-image crops skips rejoin entirely (its text is a flattened
 * table replaced by the crop). The guards here cover the remaining damage classes
 * the audit surfaced (Latin tables/labels, section labels, bullets, citations).
 *
 * See openspec/changes/fix-neurons-explanation-linewrap (modifies
 * neurons-corpus-ingestion "Explanation whitespace … safe subset").
 */

export const WRAP_MIN_WIDTH = 28

// Prev line ends a thought → keep the break after it.
const SENTENCE_END = /[。！？!?：:；;…⋯）)】」』》］\]]$/
// Prev line ends with a URL or a citation page token → a reference boundary.
const URL_END = /https?:\/\/\S+$/
const PAGE_CITE_END = /\bp\.?\s?\d+\s*$/i
// Prev line ends with an option verdict tag (e.g. `A 對` / `B 錯`) → keep break.
const VERDICT_END = /[A-Da-d]\s*[對錯]\s*$/

// Next line starts a NEW structural item → keep the break before it.
const STRUCTURAL_START = new RegExp(
  '^\\s*(' +
    '[(（][A-Ea-e1-9一二三四五六七八九十][)）]' + // (A) （一）
    '|[(（]?\\d+[.．、)）]' + // 1. 1) 1、 (1. (1)
    '|[A-Ea-e][).、]' + // A. a)
    '|[①-⑳㈠-㈩⒈-⒛]' + // circled / parenthesized numerals
    '|\\d+[°˚]' + // 1° 2°
    '|[•·‧◦▪○●※→▶►＞>]' + // bullets / arrows / angle bullets
    '|(詳解|簡解|參考資料|參考|補充|校稿補充|校稿|筆者的話|名詞辨析|附圖|圖|表|Ref|ref)\\s*[:：]?' + // section labels / refs
    '|[A-Za-z][A-Za-z]+ [–-] ' + // "Autoimmune – " parallel sub-heading
    '|https?:\\/\\/|[<＜]' + // URL / <heading>
    ')',
)

function isSeparatorLine(s: string): boolean {
  const t = s.trim()
  return t.length >= 3 && /^[─━—–\-=＝*＊※•·▪◦○●☆★｜|_＿]+$/.test(t)
}

function isAsciiAlnum(ch: string | undefined): boolean {
  return ch !== undefined && ch.length === 1 && /[0-9A-Za-z]/.test(ch)
}

/** Has at least one Han ideograph (CJK content), vs an all-Latin/digit/label line. */
function hasCJK(s: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(s)
}

/** CJK-aware display width: full/wide/ambiguous CJK = 2, else 1. */
export function visualWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    w += isWide(cp) ? 2 : 1
  }
  return w
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals · Kangxi · CJK symbols
    (cp >= 0x3041 && cp <= 0x33ff) || // Kana · CJK compat
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK ext B+
  )
}

export function rejoinHardWrappedLines(ex: string): string {
  if (!ex) return ex
  const out: string[] = []
  for (const raw of ex.split('\n')) {
    const line = raw.replace(/[ \t]+$/, '') // rstrip so end-anchored tests are robust
    if (out.length === 0) {
      out.push(line)
      continue
    }
    const prev = out[out.length - 1]
    if (
      line === '' ||
      prev === '' ||
      isSeparatorLine(prev) ||
      isSeparatorLine(line) ||
      STRUCTURAL_START.test(line) ||
      SENTENCE_END.test(prev) ||
      URL_END.test(prev) ||
      PAGE_CITE_END.test(prev) ||
      VERDICT_END.test(prev) ||
      visualWidth(prev) < WRAP_MIN_WIDTH ||
      (!hasCJK(prev) && !hasCJK(line)) || // both all-Latin → table/label/citation run
      (isAsciiAlnum(prev[prev.length - 1]) && isAsciiAlnum(line[0])) // ASCII↔ASCII boundary: don't guess a space
    ) {
      out.push(line)
      continue
    }
    out[out.length - 1] = prev + line // join with no inserted character
  }
  return out.join('\n')
}
