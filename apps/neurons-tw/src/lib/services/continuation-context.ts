import type { Question } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-neurons-tw'

/**
 * Module-memoized by-id map of the FULL neurons question bank, for resolving a
 * 承上題's preceding chain (`resolvePrecedingChain`) even when the scenario root
 * is absent from the current quiz pool (e.g. the wrong-only 出征 pool).
 *
 * One `getContentPack` fetch, cached for the session; questions.json is also
 * HTTP-cached by the browser, so the cost is amortized. Mirrors the 二階
 * `loadQuestionsByIdMap` pattern.
 */
let cache: Promise<ReadonlyMap<string, Question>> | null = null

export function loadQuestionsByIdMap(): Promise<ReadonlyMap<string, Question>> {
  if (!cache) {
    cache = getContentPack(`${import.meta.env.BASE_URL}content/neurons-tw`).then(
      (pack) => new Map(pack.questions.map((q) => [q.id, q] as const)),
    )
  }
  return cache
}
