/**
 * presign parseBody — the shared Worker's request-body contract.
 *
 * Why this file exists at all: this Worker is the single presigner for THREE
 * clients — neurons (this repo), the standalone 二階 app (repo study-rpg-2nd),
 * and the `bookmarks` bundle. Only neurons is developed here, so every other
 * client is a bundle we cannot edit in lockstep and cannot see break. "Do not
 * break 二階" was enforced only by comments until now; these tests turn the two
 * load-bearing halves of that promise into failing builds:
 *
 *   1. every field a client MAY omit stays genuinely optional, and
 *   2. the diagnostic `build` field can NEVER turn a working sync into a 400
 *      — it is sanitized, never rejected, whatever a present-or-future client
 *      puts in it.
 *
 * (1) is what keeps 二階 — which sends neither `schema_version` nor `build` —
 * working across every deploy of this Worker. (2) is what keeps a rogue or
 * future client's malformed build id from costing a real user their sync.
 */
import { describe, it, expect } from 'vitest'

import { parseBody } from '../presign'

describe('parseBody — 二階 compatibility (the shared-Worker invariant)', () => {
  it('accepts the 二階 PUT body verbatim: no schema_version, no build', () => {
    // This is the EXACT shape the standalone 二階 app sends. It lives in another
    // repo and is not redeployed when this Worker is — if this ever throws, 二階
    // sync dies in prod with no local signal.
    const parsed = parseBody({ bundle: 'm2', op: 'put' })
    expect(parsed).toEqual({ bundle: 'm2', op: 'put', schemaVersion: null, build: null })
  })

  it('accepts the 二階 GET body verbatim', () => {
    expect(parseBody({ bundle: 'm2', op: 'get' })).toEqual({
      bundle: 'm2',
      op: 'get',
      schemaVersion: null,
      build: null,
    })
  })

  it('accepts the bookmarks bundle (third client, also omits both fields)', () => {
    expect(parseBody({ bundle: 'bookmarks', op: 'put' }).bundle).toBe('bookmarks')
  })

  it('accepts the current neurons PUT body: schema_version + build both carried through', () => {
    expect(parseBody({ bundle: 'neurons', op: 'put', schema_version: 28, build: 'abc123' })).toEqual(
      { bundle: 'neurons', op: 'put', schemaVersion: 28, build: 'abc123' },
    )
  })
})

describe('parseBody — `build` is sanitized, never rejected', () => {
  // The whole point of the field is diagnostics on the throttle log line. A
  // diagnostic must not be able to break the feature it observes, so EVERY
  // rejection below degrades to null instead of throwing (which handlePresign
  // would turn into a 400 and a dead sync).

  it('degrades a non-string build to null rather than throwing', () => {
    // A future client mis-serializing the field (or a rogue one probing it) must
    // cost that request nothing.
    const hostile: unknown[] = [42, { sha: 'abc' }, ['abc'], null, true, 3.14]
    for (const build of hostile) {
      const parsed = parseBody({ bundle: 'neurons', op: 'put', build })
      expect(parsed.build).toBeNull()
      // Anti-vacuity: the rest of the parse still happened — we degraded the one
      // field, we did not bail out of the function early.
      expect(parsed.bundle).toBe('neurons')
    }
  })

  it('degrades a string build that fails the charset/length guard to null', () => {
    const rejected: string[] = [
      '', // empty — regex requires ≥1 char
      'a'.repeat(25), // 25 chars — one over the 24 cap that bounds the log line
      'abc def', // space
      'abc/def', // slash
      'abc\ndef', // newline — would forge a second log line
      '"abc"', // quotes — would corrupt the JSON log line
      '<script>', // angle brackets
      '康瑋麟', // non-ASCII
      '💥', // astral-plane codepoint
    ]
    for (const build of rejected) {
      expect(parseBody({ bundle: 'neurons', op: 'put', build }).build).toBeNull()
    }
  })

  it('accepts the charset it documents, at the boundary length', () => {
    // The mirror of the test above: proves the guard is a real filter and not a
    // blanket "always null", which would pass the rejection tests vacuously.
    const accepted: string[] = [
      'a', // 1 char — lower bound
      'a'.repeat(24), // 24 chars — upper bound, must NOT be rejected (off-by-one)
      'abc123', // the realistic short sha
      'v1.2.3', // dots
      'feat_x-1', // underscore + dash
    ]
    for (const build of accepted) {
      expect(parseBody({ bundle: 'neurons', op: 'put', build }).build).toBe(build)
    }
  })

  it('no value of `build` can make a valid request throw', () => {
    // The contract stated as a property rather than as cases: `build` is the
    // ONLY field added to a body shape that three separate clients already send,
    // so its blast radius on a wrong day is "everyone's sync 400s".
    const anything: unknown[] = [
      undefined,
      null,
      '',
      'ok',
      'a'.repeat(1000),
      0,
      NaN,
      Infinity,
      [],
      {},
      { toString: () => 'abc' },
      Symbol('x'),
      () => 'abc',
      new Date(),
    ]
    for (const build of anything) {
      for (const op of ['put', 'get'] as const) {
        expect(() => parseBody({ bundle: 'neurons', op, build })).not.toThrow()
      }
    }
  })

  it('build is carried on GET too — the field is op-agnostic', () => {
    // GET presigns are the ones the visibility-pull throttle is about, so build
    // attribution must survive that path as well.
    expect(parseBody({ bundle: 'neurons', op: 'get', build: 'abc123' }).build).toBe('abc123')
  })
})

describe('parseBody — pre-existing rejections still reject (no regression)', () => {
  // These threw before `build` existed and must still throw: unlike `build`,
  // these fields address the R2 object, so a bad value is a real client bug and
  // failing closed is correct.

  it('rejects an unknown or non-string bundle', () => {
    expect(() => parseBody({ bundle: 'm1', op: 'put' })).toThrow('invalid_bundle')
    expect(() => parseBody({ bundle: 'nope', op: 'put' })).toThrow('invalid_bundle')
    expect(() => parseBody({ op: 'put' })).toThrow('invalid_bundle')
    expect(() => parseBody({ bundle: 7, op: 'put' })).toThrow('invalid_bundle')
    expect(() => parseBody({ bundle: null, op: 'put' })).toThrow('invalid_bundle')
  })

  it('rejects an unknown or non-string op', () => {
    expect(() => parseBody({ bundle: 'neurons', op: 'delete' })).toThrow('invalid_op')
    expect(() => parseBody({ bundle: 'neurons' })).toThrow('invalid_op')
    expect(() => parseBody({ bundle: 'neurons', op: 1 })).toThrow('invalid_op')
  })

  it('rejects a malformed schema_version on PUT', () => {
    const bad: unknown[] = ['28', 0, -1, 2.5, NaN, Infinity, null, {}]
    for (const schema_version of bad) {
      expect(() => parseBody({ bundle: 'neurons', op: 'put', schema_version })).toThrow(
        'invalid_schema_version',
      )
    }
  })

  it('accepts a valid schema_version on PUT (guard is a filter, not a blanket reject)', () => {
    expect(parseBody({ bundle: 'neurons', op: 'put', schema_version: 1 }).schemaVersion).toBe(1)
    expect(parseBody({ bundle: 'neurons', op: 'put', schema_version: 28 }).schemaVersion).toBe(28)
  })

  it('ignores schema_version entirely on GET — even a malformed one', () => {
    // Documented behaviour ("GET ops: schema_version ignored entirely"). 二階
    // would be the one to trip this if it ever started sending the field on
    // reads, so lock the leniency rather than let a tightening slip in.
    expect(parseBody({ bundle: 'm2', op: 'get', schema_version: 'garbage' }).schemaVersion).toBeNull()
    expect(parseBody({ bundle: 'm2', op: 'get', schema_version: -5 }).schemaVersion).toBeNull()
  })

  it('bundle is validated before op — error precedence is stable', () => {
    // Both invalid: the caller surfaces `err.message` verbatim as the 400 body,
    // so which one wins is observable to clients.
    expect(() => parseBody({ bundle: 'nope', op: 'nope' })).toThrow('invalid_bundle')
  })
})
