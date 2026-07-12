/**
 * Leaf-anchor gate for the 考前講義 (add-neurons-handout-unit-correspondence).
 *
 * The handout splits a subject into `.hdt-region` sections; each region contains one or more
 * `<div class="hdt-topic">` teaching topics. This gate gives every TAGGED topic a leaf-granularity
 * sub-anchor so the three prep systems (講義 / 救急 / 猜題) can cross-link at canonical `leafId`
 * granularity, WITHOUT re-cutting regions.
 *
 * Convention (co-located in the source HTML — the single source of truth for fact-verify):
 *   <div class="hdt-topic" data-leaf-ids="leafA leafB"> … <h3>…</h3> … </div>
 *   - `data-leaf-ids` is a space-separated list of the canonical leafIds this topic PRIMARILY teaches.
 *   - Multi-value because topic:leaf is not strictly 1:1 (解剖 76 topic / 87 leaf, 病理 90 / 65).
 *   - A canonical leaf appears in AT MOST ONE topic's data-leaf-ids (= its single primary anchor).
 *   - `id` is auto-INJECTED by this gate (`hdt-topic-<firstLeafId>`); taggers only add data-leaf-ids.
 *
 * The gate is INDEPENDENT of the region-keyed config↔HTML drift check (build-region-quizzes): it
 * only reads `.hdt-topic` wrappers, never `.hdt-region` sections. Untagged topics are legal (they
 * simply carry no anchor → the resolver degrades to region granularity). Non-quiz regions (the
 * 一週攻略地圖 overview) carry no `.hdt-topic` at all, so they are exempt automatically.
 *
 * Pure + filesystem-free so it is unit-testable (mirrors build-region-quizzes.ts). Throws on any
 * contract violation; the build wrapper converts the throw into a loud `process.exit(1)`.
 */

export interface LeafAnchorResult {
  /** The subject HTML with a stable `id` injected on every TAGGED topic (data-leaf-ids passed through verbatim). */
  html: string
  /** Canonical leaves that have a primary topic anchor (appear in some data-leaf-ids). */
  anchoredLeaves: string[]
  /** Total region-bearing canonical leaves for the subject (coverage denominator). */
  totalLeaves: number
}

// Matches ONE `.hdt-topic` opening tag. All 572 authored topics are exactly `<div class="hdt-topic"…>`
// (verified); the attribute run `[^>]*` never contains a raw `>` in the authored fragments.
const TOPIC_OPEN_RE = /<div class="hdt-topic"([^>]*)>/g
const DATA_LEAF_IDS_RE = /\sdata-leaf-ids="([^"]*)"/
const HAS_ID_RE = /\sid="/

/**
 * Validate + inject leaf-level sub-anchors on a subject's authored handout HTML and report coverage.
 *
 * Loud-fails (throws) when:
 *  - a `data-leaf-ids` token is not a canonical leaf of the subject (rename / typo drift), or
 *  - a single canonical leaf is declared primary by more than one topic (duplicate primary anchor).
 *
 * Does NOT fail when a canonical leaf is carried by no topic — that leaf degrades to region-level
 * resolution and is counted in `anchoredLeaves` / `totalLeaves` so the gap is visible, never silent.
 */
export function injectLeafAnchors(
  subjectId: string,
  html: string,
  canonicalLeaves: ReadonlySet<string>,
): LeafAnchorResult {
  // Per leaf, the DISTINCT topics that claim it (keyed by a monotonic topic ordinal — NOT the injected
  // id, which collides when two topics share a first leaf; that collision is itself a duplicate primary).
  const leafToTopics = new Map<string, { seq: number; id: string }[]>()
  let topicSeq = 0

  const out = html.replace(TOPIC_OPEN_RE, (full, attrs: string) => {
    const m = DATA_LEAF_IDS_RE.exec(attrs)
    if (!m) return full // untagged topic — no anchor, no id (graceful; resolver falls back to region)
    const tokens = m[1].trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return full
    for (const t of tokens) {
      if (!canonicalLeaves.has(t))
        throw new Error(
          `${subjectId}: topic data-leaf-ids token "${t}" is not a canonical leaf of ${subjectId} (rename / typo drift?)`,
        )
    }
    const seq = topicSeq++
    const id = `hdt-topic-${tokens[0]}`
    for (const t of tokens) (leafToTopics.get(t) ?? leafToTopics.set(t, []).get(t)!).push({ seq, id })
    // Injecting the id is idempotent: an authored id (should not exist) is kept as-is.
    if (HAS_ID_RE.test(attrs)) return full
    return `<div class="hdt-topic"${attrs} id="${id}">`
  })

  // Duplicate-primary: each canonical leaf may be claimed by AT MOST one distinct topic.
  for (const [leaf, occs] of leafToTopics) {
    if (new Set(occs.map((o) => o.seq)).size > 1)
      throw new Error(
        `${subjectId}: canonical leaf "${leaf}" declared primary by >1 topic (${[...new Set(occs.map((o) => o.id))].join(', ')}) — each leaf has exactly one primary anchor`,
      )
  }

  const anchoredLeaves = [...leafToTopics.keys()]
  return { html: out, anchoredLeaves, totalLeaves: canonicalLeaves.size }
}
