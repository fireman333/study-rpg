import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  runNoteImageSweepCron,
  sweepConnectionString,
  SweepConfigError,
  type SweepDb,
} from '../note-image-sweep'
import type { Env } from '../index'

// The module's own figures, restated so a change to either fails these tests loudly rather than
// silently altering how much one run reclaims. 20 x 25 = 500 objects per night, ~540 subrequests
// against the Workers Paid ceiling of 10,000.
const BATCH = 25
const MAX_BATCHES = 20

const ids = (n: number, prefix = 'a'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(7, '0')}-2222-4222-8222-222222222222`)

/** A Postgres error as postgres.js surfaces it: the SQLSTATE lives on `.code`. */
function pgError(code: string, message = 'pg'): Error {
  return Object.assign(new Error(message), { code })
}

function harness(
  opts: {
    claim?: (limit: number) => Promise<string[]>
    confirm?: (ids: string[]) => Promise<number>
    closeFails?: boolean
    deleteFails?: (key: string) => boolean
  } = {},
) {
  const confirmCalls: string[][] = []
  const deletedKeys: string[] = []
  let closed = 0

  const db: SweepDb = {
    claim: opts.claim ?? (async () => []),
    confirm:
      opts.confirm ??
      (async (batch: string[]) => {
        confirmCalls.push(batch)
        return batch.length
      }),
    close: async () => {
      closed += 1
      if (opts.closeFails) throw new Error('close failed')
    },
  }
  // Wrap so confirm is always recorded even when a custom implementation is supplied.
  const recordingDb: SweepDb = {
    ...db,
    confirm: async (batch: string[]) => {
      confirmCalls.push(batch)
      return opts.confirm ? await opts.confirm(batch) : batch.length
    },
  }

  const del = vi.fn(async (key: string) => {
    if (opts.deleteFails?.(key)) throw new Error('r2 down')
    deletedKeys.push(key)
  })

  const env = { R2_PRIMARY: { delete: del } } as unknown as Env

  return {
    env,
    db: recordingDb,
    open: () => recordingDb,
    del,
    deletedKeys,
    confirmCalls,
    closedCount: () => closed,
  }
}

/** Claim returns the given batches in order, then empty. */
function claimSequence(batches: string[][]) {
  let i = 0
  return async () => batches[i++] ?? []
}

describe('runNoteImageSweepCron', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records a run that reclaimed nothing', async () => {
    const h = harness({ claim: async () => [] })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally).toMatchObject({ batches: 1, claimed: 0, deleted: 0, stopped: 'drained' })
    // A sweep that has silently stopped and a sweep with nothing to do must not look the same.
    expect(console.log).toHaveBeenCalledWith('[note-image-sweep] run complete', tally)
    expect(h.confirmCalls).toEqual([])
  })

  it('deletes the bytes for every claimed identity and confirms them', async () => {
    const batch = ids(3)
    const h = harness({ claim: claimSequence([batch]) })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(h.deletedKeys).toEqual(batch.map(id => `note-images/${id}`))
    expect(h.confirmCalls).toEqual([batch])
    expect(tally).toMatchObject({ claimed: 3, deleted: 3, confirmed: 3, deleteFailures: 0 })
  })

  it('claims again while a batch comes back full, and stops on a short one', async () => {
    const h = harness({ claim: claimSequence([ids(BATCH, 'a'), ids(2, 'b')]) })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally).toMatchObject({ batches: 2, claimed: BATCH + 2, stopped: 'drained' })
  })

  it('stops at the derived batch ceiling rather than draining without bound', async () => {
    // Always a full batch — the queue never empties.
    const h = harness({ claim: async () => ids(BATCH) })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally.batches).toBe(MAX_BATCHES)
    expect(tally.claimed).toBe(BATCH * MAX_BATCHES)
    expect(tally.stopped).toBe('budget')
  })

  // The invariant the whole two-phase design rests on.
  it('does not confirm an identity whose bytes it failed to delete', async () => {
    const batch = ids(3)
    const doomed = batch[1]
    const h = harness({
      claim: claimSequence([batch]),
      deleteFails: key => key === `note-images/${doomed}`,
    })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    // Asserted on the arguments actually passed: a test that only checked "did not throw" would
    // pass while the tombstone was being dropped for bytes that are still stored.
    expect(h.confirmCalls).toEqual([[batch[0], batch[2]]])
    expect(h.confirmCalls[0]).not.toContain(doomed)
    // The other two are still attempted — one failure costs one object, not the batch.
    expect(h.deletedKeys).toEqual([`note-images/${batch[0]}`, `note-images/${batch[2]}`])
    expect(tally).toMatchObject({ deleted: 2, deleteFailures: 1 })
    // Named in the log, because after this the tombstone is the only thing that knows.
    expect(console.error).toHaveBeenCalledWith(
      '[note-image-sweep] r2 delete failed; tombstone kept for retry',
      expect.objectContaining({ imageId: doomed }),
    )
  })

  it('confirms nothing when every delete in the batch fails', async () => {
    const h = harness({ claim: claimSequence([ids(2)]), deleteFails: () => true })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(h.confirmCalls).toEqual([])
    expect(tally).toMatchObject({ claimed: 2, deleted: 0, deleteFailures: 2 })
  })

  it('refuses without touching anything when the connection string is absent', async () => {
    // No injected opener: this exercises the real openSweepDb config check.
    const env = { R2_PRIMARY: { delete: vi.fn() } } as unknown as Env

    const tally = await runNoteImageSweepCron(env)

    expect(env.R2_PRIMARY.delete).not.toHaveBeenCalled()
    expect(tally.stopped).toBe('error')
    expect(console.error).toHaveBeenCalledWith(
      '[note-image-sweep] run aborted',
      expect.objectContaining({ err: expect.stringContaining('NOTE_IMAGE_SWEEPER_DATABASE_URL') }),
    )
  })

  // The transport contract (2026-08-01): the direct URL cannot work from workerd — Supavisor's
  // certificate chains to a private CA that startTls() cannot be told to trust — so when the
  // Hyperdrive binding exists it MUST win, even while the old secret is still set (it will be).
  describe('sweepConnectionString', () => {
    const hyperdrive = { connectionString: 'postgres://sweeper:pw@hyperdrive.local:5432/postgres' }

    it('prefers the Hyperdrive binding over the direct secret when both are set', () => {
      const env = {
        NOTE_IMAGE_SWEEPER_HYPERDRIVE: hyperdrive,
        NOTE_IMAGE_SWEEPER_DATABASE_URL: 'postgres://sweeper:pw@pooler.example:6543/postgres',
      } as unknown as Env

      expect(sweepConnectionString(env)).toEqual({
        url: hyperdrive.connectionString,
        viaHyperdrive: true,
      })
    })

    it('falls back to the direct secret while the binding does not exist', () => {
      const env = {
        NOTE_IMAGE_SWEEPER_DATABASE_URL: 'postgres://sweeper:pw@pooler.example:6543/postgres',
      } as unknown as Env

      expect(sweepConnectionString(env)).toEqual({
        url: 'postgres://sweeper:pw@pooler.example:6543/postgres',
        viaHyperdrive: false,
      })
    })

    it('names both missing sources when neither is configured', () => {
      expect(() => sweepConnectionString({} as unknown as Env)).toThrow(SweepConfigError)
      expect(() => sweepConnectionString({} as unknown as Env)).toThrow(
        /NOTE_IMAGE_SWEEPER_HYPERDRIVE.*NOTE_IMAGE_SWEEPER_DATABASE_URL/s,
      )
    })
  })

  it('retries a deadlock victim and then makes progress', async () => {
    let attempt = 0
    const batch = ids(2)
    const h = harness({
      claim: async () => {
        if (attempt++ === 0) throw pgError('40P01', 'deadlock detected')
        return attempt === 2 ? batch : []
      },
    })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally).toMatchObject({ claimed: 2, deleted: 2, stopped: 'drained' })
  })

  it('gives up after the retry budget and reports rather than throwing', async () => {
    const h = harness({
      claim: async () => {
        throw pgError('40P01', 'deadlock detected')
      },
    })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally.stopped).toBe('error')
    expect(h.closedCount()).toBe(1)
  })

  it('treats a lock timeout as a clean end of run, not a failure', async () => {
    const h = harness({
      claim: async () => {
        throw pgError('55P03', 'lock timeout')
      },
    })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally.stopped).toBe('lock-timeout')
    expect(tally.claimed).toBe(0)
    // The candidates keep; this is not an error path.
    expect(console.error).not.toHaveBeenCalledWith(
      '[note-image-sweep] run aborted',
      expect.anything(),
    )
  })

  it('returns the connection on every path, including a failing one', async () => {
    const ok = harness({ claim: claimSequence([ids(1)]) })
    await runNoteImageSweepCron(ok.env, ok.open)
    expect(ok.closedCount()).toBe(1)

    const bad = harness({
      claim: async () => {
        throw pgError('42501', 'permission denied')
      },
    })
    await runNoteImageSweepCron(bad.env, bad.open)
    expect(bad.closedCount()).toBe(1)
  })

  it('does not let a failure to close mask the run', async () => {
    const h = harness({ claim: claimSequence([ids(1)]), closeFails: true })

    const tally = await runNoteImageSweepCron(h.env, h.open)

    expect(tally).toMatchObject({ claimed: 1, deleted: 1, stopped: 'drained' })
    expect(console.error).toHaveBeenCalledWith(
      '[note-image-sweep] closing the connection failed',
      expect.objectContaining({ err: expect.stringContaining('close failed') }),
    )
  })
})
