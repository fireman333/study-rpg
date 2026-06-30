/**
 * DMN draw-entitlement projection
 * (fix-neurons-dmn-draw-entitlement-resurrection).
 *
 * `dmnDrawsAvailable` (the unspent pool the UI shows) is a DERIVED display value,
 * NOT an independently-merged synced field. The canonical source of truth is two
 * monotonic-MAX counters:
 *   - `dmnGrantsTotal`   — lifetime draw entitlements granted
 *   - `dmnConsumesTotal` — lifetime draws spent (backed by the existing
 *                          `dmnLifetimeDrawsConsumed` meta key — same value)
 *   - `dmnDrawsAvailable = clamp(grants − consumes, ≥ 0)`
 *
 * Two only-increasing counters merge correctly by MAX; the old raw-MAX of the
 * bidirectional `dmnDrawsAvailable` could not represent the consume direction,
 * so a spent draw was resurrected whenever a pull read a stale-higher cloud value.
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 *   "DMN daily counters SHALL merge across devices via documented monotonic semantics"
 */

/** Derived unspent pool. Never negative. */
export function deriveDrawsAvailable(grantsTotal: number, consumesTotal: number): number {
  return Math.max(grantsTotal - consumesTotal, 0)
}

/**
 * Reader-tolerance seed for `dmnGrantsTotal`. A state/bundle produced by a client
 * at R2 SCHEMA_VERSION < 23 carries no grants counter; reconstruct it from the
 * pool it DID carry: `grants = drawsAvailable + consumesTotal`.
 *
 * Treating an absent grants total as 0 is FORBIDDEN — it would derive a negative
 * pool clamped to 0 and wipe the player's unspent draws.
 */
export function seedGrantsTotal(args: {
  grantsTotal: number | null | undefined
  drawsAvailable: number
  consumesTotal: number
}): number {
  const { grantsTotal, drawsAvailable, consumesTotal } = args
  if (grantsTotal != null && Number.isFinite(grantsTotal)) return grantsTotal
  return drawsAvailable + consumesTotal
}
