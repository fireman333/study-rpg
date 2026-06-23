// Single-flight serialization for R2 pushes (port-neurons-r2-single-flight-push S1/S4).
//
// At most one R2 push runs at a time per user — across overlapping triggers in
// one tab (debounced push, beforeunload flush, manual status-light sync, the
// account-reset bundle push) AND across concurrent tabs of the same origin.
// `navigator.locks` is origin-wide and auto-releases when the callback settles
// or the holding tab is closed, so it serializes both cases without a manual
// leader / heartbeat.
//
// Lock name uses a NEURONS-SPECIFIC prefix on purpose. `/neurons/` and `/2nd/`
// share the med-study-rpg.com origin (Web Locks are origin-wide, path-agnostic)
// but push DIFFERENT R2 bundles, so a shared lock name would needlessly
// serialize the two apps. Distinct prefixes keep them independent.
//
// Fallback: when the Web Locks API is unavailable (old Safari < 15.4, or a
// non-browser test env), serialize within this tab via a PER-USER promise chain.
// Distinct users do not serialize against each other (mirrors the per-user Web
// Locks contract); that leaves concurrent cross-tab pushes unserialized — no
// worse than the pre-change unserialized baseline.

const LOCK_PREFIX = 'neurons-rpg.r2-push.'

const noop = (): void => {}

// In-tab fallback chains, keyed by userId — each queued push waits for the
// previous push for the SAME user to settle. Errors are swallowed in the chain
// so one failed push cannot poison subsequent pushes.
const fallbackChains = new Map<string, Promise<unknown>>()

/**
 * Run `fn` under the per-user R2 push lock and return its result. Uses
 * `navigator.locks` when available (serializes same-tab + cross-tab for the
 * user), else a same-tab per-user promise-chain fallback. Errors from `fn`
 * propagate to the caller; the fallback chain swallows them so one failed push
 * cannot poison subsequent pushes.
 */
export async function withPushLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks && typeof locks.request === 'function') {
    return locks.request(LOCK_PREFIX + userId, () => fn()) as Promise<T>
  }
  const prev = fallbackChains.get(userId) ?? Promise.resolve()
  const run = prev.then(fn, fn) as Promise<T>
  fallbackChains.set(userId, run.then(noop, noop))
  return run
}
