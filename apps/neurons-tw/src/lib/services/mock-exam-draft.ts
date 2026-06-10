/**
 * Local persistence for an in-progress 模擬考試 run (one draft per paper) so a
 * closed modal / page refresh can be resumed from the launcher. Stores only the
 * minimal state; everything derived recomputes on restore. Drafts are local &
 * ephemeral — never synced to the cloud — and are deleted on 全部送出.
 *
 * The pure helpers (`paperKeyHash` / `isDraftFresh`) + the `MockExamDraftRow`
 * shape live in `@study-rpg/core` (`add-neurons-exam-set-mock-mode` lift); this
 * module only owns the neurons Dexie ops. neurons addresses a paper by
 * (year, 次別 `session`, 冊別 `book`); core's key uses `sitting`, so we map
 * `session → sitting` when hashing.
 *
 * Spec: openspec/specs/neurons-exam-set-expedition/spec.md
 *   "In-progress mock exams SHALL be resumable after accidental exit"
 */

import { paperKeyHash, type MockExamDraftRow } from '../exam-set-mock'
import { db } from '../db'

/** neurons paper coordinates (次別 = `session`, mapped to core's `sitting`). */
export interface NeuronsPaperKey {
  year: number
  session: number
  book: string
}

function hashOf(key: NeuronsPaperKey): string {
  return paperKeyHash({ year: key.year, sitting: key.session, book: key.book })
}

export interface SaveMockDraftInput {
  key: NeuronsPaperKey
  /** Frozen question-id order of the pool (used to detect corpus drift on restore). */
  questionIds: string[]
  answers: Array<string | null>
  flaggedIndexes: number[]
  index: number
  startedAt: number
  /** Epoch ms; injected by the caller so this module stays clock-free for tests. */
  now: number
}

/** Upsert the draft for a paper (called debounced on answer / flag / navigation). */
export async function saveMockDraft(input: SaveMockDraftInput): Promise<void> {
  await db.mockExamDrafts.put({
    paperKeyHash: hashOf(input.key),
    year: input.key.year,
    sitting: input.key.session,
    book: input.key.book,
    questionIds: input.questionIds,
    answers: input.answers,
    flaggedIndexes: input.flaggedIndexes,
    index: input.index,
    startedAt: input.startedAt,
    updatedAt: input.now,
  })
}

/** The saved draft for a paper, or undefined if none. */
export async function loadMockDraft(key: NeuronsPaperKey): Promise<MockExamDraftRow | undefined> {
  return db.mockExamDrafts.get(hashOf(key))
}

/** Remove the draft for a paper (on 全部送出 or explicit 重新開始). */
export async function deleteMockDraft(key: NeuronsPaperKey): Promise<void> {
  await db.mockExamDrafts.delete(hashOf(key))
}
