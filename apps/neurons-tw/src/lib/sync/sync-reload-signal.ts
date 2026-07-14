/**
 * Schema-downgrade reload signal — a once-per-session app-level event
 * (add-neurons-multi-subject-rescue, design D4).
 *
 * When a bundle push is refused by the presign Worker's schema-version downgrade
 * guard (409 → `r2_schema_downgrade_refused_by_server`), the client is a stale
 * tab running a pre-bump build after a newer-schema bundle has landed. Because
 * rescue writes on EVERY confidence tap, such a tab would otherwise generate a
 * heavy presign/409 stream on every dirty cycle. The sync engine detects that
 * specific rejection and fires this signal ONCE; an App-level `SyncReloadToast`
 * subscribes and surfaces a "有新版本，請重新整理" prompt (a reload loads the new
 * build, whose push carries the current schema version). The sync light stays 🔴
 * until the reload (the engine still records the error in `lastError`).
 *
 * A dedicated event (not `lastError`) is used so the prompt fires exactly once
 * and does not re-fire when `lastError` clears/re-sets across dirty cycles.
 * Pure module state — no React / DOM dependency, so it is unit-testable.
 *
 * A second producer reuses the same one-shot channel with a neutral reason:
 * a tab stuck in a sustained presign-429 / deferred-412 streak (see engine.ts
 * RELOAD_PROMPT_STREAK) fires `signalSyncStallReload()` — such a tab is most
 * plausibly a stale cached bundle, and a reload upgrades it to the current
 * client. The toast reads `getSyncReloadReason()` to pick non-misleading copy
 * (the schema wording「有新版本」would be wrong for a rate-limited tab).
 */

export type SyncReloadReason = 'schema-downgrade' | 'sync-stall'

let fired = false
let firedReason: SyncReloadReason | null = null
const listeners = new Set<() => void>()

function signalSyncReload(reason: SyncReloadReason): void {
  if (fired) return
  fired = true
  firedReason = reason
  listeners.forEach((fn) => fn())
}

/** Fire the reload prompt ONCE per session. Idempotent — later calls no-op (so a
 *  stale tab that keeps 409-ing does not re-surface the prompt each dirty cycle). */
export function signalSchemaDowngradeReload(): void {
  signalSyncReload('schema-downgrade')
}

/** Same one-shot reload prompt, fired after a sustained presign-429 / deferred
 *  streak (engine.ts RELOAD_PROMPT_STREAK). First reason wins — both remedies
 *  are the same reload. */
export function signalSyncStallReload(): void {
  signalSyncReload('sync-stall')
}

/** Which producer fired the one-shot prompt (null before it fires). */
export function getSyncReloadReason(): SyncReloadReason | null {
  return firedReason
}

/** Whether the once-per-session reload prompt has been triggered. */
export function shouldShowSchemaDowngradeReload(): boolean {
  return fired
}

export function subscribeSchemaDowngradeReload(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Test hook — reset the once-per-session latch. */
export function __resetSchemaDowngradeReloadForTests(): void {
  fired = false
  firedReason = null
  listeners.clear()
}
