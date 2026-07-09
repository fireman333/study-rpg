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
 */

let fired = false
const listeners = new Set<() => void>()

/** Fire the reload prompt ONCE per session. Idempotent — later calls no-op (so a
 *  stale tab that keeps 409-ing does not re-surface the prompt each dirty cycle). */
export function signalSchemaDowngradeReload(): void {
  if (fired) return
  fired = true
  listeners.forEach((fn) => fn())
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
  listeners.clear()
}
