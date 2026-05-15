import Dexie, { type EntityTable } from 'dexie'
import type {
  Player,
  Question,
  Subject,
  Attempt,
  SrsCard,
  ReadSession,
  BossRun,
  Item,
  ItemInstance,
  Drop,
  MockAttempt,
  MockInProgress,
  MentorBacklog,
} from '../types'

/** Singleton wrapper for in-progress mock state. Only one row, key = 'mockInProgress'. */
export interface MockInProgressRecord extends MockInProgress {
  key: 'mockInProgress'
}

/** Singleton wrapper for mentor-daily backlog. Only one row, key = 'mentorBacklog'. */
export interface MentorBacklogRecord extends MentorBacklog {
  key: 'mentorBacklog'
}

export class StudyRpgDB extends Dexie {
  players!: EntityTable<Player, 'id'>
  questions!: EntityTable<Question, 'id'>
  subjects!: EntityTable<Subject, 'id'>
  attempts!: EntityTable<Attempt, 'id'>
  srs!: EntityTable<SrsCard, 'questionId'>
  readSessions!: EntityTable<ReadSession, 'id'>
  bossRuns!: EntityTable<BossRun, 'id'>
  items!: EntityTable<Item, 'id'>
  itemInstances!: EntityTable<ItemInstance, 'id'>
  drops!: EntityTable<Drop, 'id'>
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>
  mockAttempts!: EntityTable<MockAttempt, 'id'>
  mockInProgress!: EntityTable<MockInProgressRecord, 'key'>
  mentorBacklog!: EntityTable<MentorBacklogRecord, 'key'>

  constructor(name = 'study-rpg') {
    super(name)
    this.version(1).stores({
      players: 'id, lastActiveAt',
      questions: 'id, subject',
      subjects: 'id',
      attempts: 'id, questionId, ts, mode',
      srs: 'questionId, dueAt',
      readSessions: 'id, startTs, subject',
      bossRuns: 'id, startTs, mode, subject',
      items: 'id, rarity, slot',
      itemInstances: 'id, itemId, obtainedAt',
      drops: 'id, ts, source, rarity',
      meta: 'key',
    })
    // v2 — additive: mock exam storage (see mock-exam capability)
    this.version(2).stores({
      mockAttempts: 'id, paperId, finishedAt',
      mockInProgress: 'key',
    })
    // v3 — additive: mentor-daily backlog (see mentor-daily capability)
    this.version(3).stores({
      mentorBacklog: 'key',
    })
  }
}

let _db: StudyRpgDB | undefined

export function getDB(): StudyRpgDB {
  if (!_db) _db = new StudyRpgDB()
  return _db
}

/** Wipe everything. For dev/debug only — do not call in production paths. */
export async function resetDB() {
  await getDB().delete()
  _db = undefined
}
