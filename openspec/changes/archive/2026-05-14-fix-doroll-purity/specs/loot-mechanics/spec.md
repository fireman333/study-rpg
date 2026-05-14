## ADDED Requirements

### Requirement: Callers SHALL NOT invoke loot functions inside React state updaters

Application code that calls `rollLoot` / `instanceFromRoll` SHALL invoke them **outside** any React state-updater callback (e.g. the function passed to `setPlayer((p) => ...)`).

State updaters MUST be pure: in React 18 StrictMode, updaters are invoked **twice** to detect impurity. Calling `instanceFromRoll` inside an updater generates a different `ItemInstance.id` on each invocation (because `defaultId` uses `crypto.randomUUID()` or timestamp), causing duplicated inventory entries; calling `setInstances` inside an updater queues two state transitions per click. Both are observable as inventory inflation in dev mode.

The correct pattern:

```ts
// ✅ Pure: side effects outside updater
function doRoll(source) {
  const r = rollLoot(catalog, player.lootStats)
  if (!r) return
  const { instance } = instanceFromRoll(r, source)
  setReveal(r)
  setInstances((prev) => [...prev, instance])
  setPlayer((p) => ({
    ...p,
    lootStats: r.newStats,
    inventory: [...p.inventory, instance.id],
  }))
}
```

```ts
// ❌ Impure: setInstances + instanceFromRoll inside setPlayer updater
function doRoll(source) {
  setPlayer((p) => {
    const r = rollLoot(catalog, p.lootStats)
    if (!r) return p
    const inst = instanceFromRoll(r, source)  // ← runs 2x in StrictMode
    setInstances((prev) => [...prev, inst.instance])  // ← runs 2x in StrictMode
    return { ...p, lootStats: r.newStats, inventory: [...p.inventory, inst.instance.id] }
  })
}
```

#### Scenario: 3 manual rolls produce exactly 3 instances in dev mode

- **WHEN** the player clicks the manual-roll button exactly 3 times in development mode (with `<React.StrictMode>` enabled)
- **THEN** after the third roll completes, `Player.lootStats.totalRolls` SHALL equal `3`
- **AND** the `ItemInstance[]` array length SHALL also equal `3`
- **AND** the IndexedDB `itemInstances` table SHALL contain exactly 3 records

#### Scenario: Updater impurity is forbidden at review

- **WHEN** a PR adds or modifies a `setPlayer((p) => { ... })` block that calls `rollLoot`, `instanceFromRoll`, `setInstances`, `setReveal`, or any other side-effectful function inside the updater body
- **THEN** the PR SHALL be rejected as violating React state-updater purity
- **AND** the fix SHALL be to extract the side effect to before the `setPlayer` call
