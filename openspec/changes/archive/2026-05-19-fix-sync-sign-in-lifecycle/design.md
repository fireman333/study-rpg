# Design Notes — fix-sync-sign-in-lifecycle

## Goal

Make the cloud-sync sign-in lifecycle:

1. **Correct** under account-switch (Bug 2): no silent data corruption when a second Google account signs into the same browser.
2. **Race-resistant** on slow mobile cold-load (Bug 1): the migration / conflict modal SHALL fire when it should.
3. **Observable**: when something does go wrong, the user sees it (status chip + error toast) and the owner can debug from a bug report (`sync_metadata` snapshot) without live reproduction.
4. **Readable on mobile** (Bug 3): paused banner doesn't collapse to per-character vertical text.

## Architecture overview

```
                          ┌─────────────────────────────────┐
                          │   AuthContext (Supabase OAuth)  │
                          │   - tracks user.id              │
                          │   - on authed: writes            │
                          │     db.meta.last_signed_in_uid  │
                          └────────────────┬────────────────┘
                                           │ user.id change
                                           ▼
              ┌───────────────────────────────────────────────────┐
              │  Account-switch detector (account-switch.ts NEW)  │
              │  - reads db.meta.last_signed_in_uid                │
              │  - if mismatch + local non-default →               │
              │    raise AccountSwitchPrompt before gate runs     │
              └────────────────┬──────────────────────────────────┘
                               │ resolved / no-mismatch
                               ▼
              ┌───────────────────────────────────────────────────┐
              │   useSync.computeGateState (race-hardened)        │
              │   1. await db.players.get('p1')                   │
              │   2. await 100ms settle delay                      │
              │   3. run hasNonDefaultLocalState()                 │
              │   4. emit [sync.gate] DEV log                     │
              │   5. if state ∈ {fresh-start, silent-pull}:        │
              │      install 5s post-decision watcher              │
              └────────────────┬──────────────────────────────────┘
                               │
                               ▼
              ┌───────────────────────────────────────────────────┐
              │   Engine.diagnose() — DEV global handle           │
              │   Bug report snapshot calls this to fill           │
              │   bug_reports.sync_metadata JSONB                  │
              └───────────────────────────────────────────────────┘
                               │
                               ▼
              ┌───────────────────────────────────────────────────┐
              │   UI surface                                       │
              │   - SyncStatusChip (header) — 🟢🟡🔴⚪⏸           │
              │   - Sync error toast (2 consecutive failures)     │
              │   - Banner mobile reflow at < 640px                │
              └───────────────────────────────────────────────────┘
```

## Key decisions

### D1. Account-switch detection — read at sign-in, NOT at sign-out (chosen)

**Considered**: Clear local data inside `signOut()` whenever user signs out, so a fresh sign-in is always "from blank state".

**Rejected because**: violates current `auth` spec L35-43 ("Sign-out preserves local data") which exists for a real use case — users who sign in to sync occasionally but mostly play offline. Clearing on every sign-out would lose progress for "I'll sync later, but for now let me play" users.

**Chosen**: detect mismatch at the moment of next sign-in. `db.meta.last_signed_in_user_id` is updated only on successful sign-in (not sign-out). When user signs in with new account:

- If `last_signed_in_user_id` IS NULL → first sign-in ever → existing migration flow applies
- If `last_signed_in_user_id === current.user.id` → same account returning → existing gate flow
- If `last_signed_in_user_id !== current.user.id` → ACCOUNT SWITCH → new `AccountSwitchPrompt` modal fires before gate runs

The user explicitly chooses the merge strategy. After they pick, `last_signed_in_user_id` is updated to current user, and normal gate flow proceeds with whatever state the user chose.

### D2. Gate race fix — hydration await + 100ms settle + 5s re-evaluation (chosen)

**Considered approaches**:

| Approach | Pros | Cons |
|---|---|---|
| A. Synchronous Dexie call (await one `get('p1')`) | Simple | Doesn't help — even with await, write-pending state may not be visible yet on mobile cold-start where IDB transaction queue lags |
| B. Explicit hydration event (Dexie `ready` promise + custom signal) | Most rigorous | Requires plumbing a hydration completion signal through all stores — high change cost |
| **C. await + 100ms settle + 5s re-eval window (chosen)** | Pragmatic, low-risk, covers 99%+ cases | Imperfect; pathological devices may still race past 5s |

The 100ms settle is calibrated from observed Dexie cold-load timings on iPhone SE 2nd gen (slowest commonly-deployed iOS); doubled for safety margin. Re-evaluation window of 5s catches the long tail. Combined coverage estimated > 99.9%.

If telemetry from `sync_metadata` later shows a non-trivial re-evaluation rate (> 1% of sessions), revisit with approach B.

### D3. Sync status chip — separate component, header placement (chosen)

**Considered**: extend existing `AuthButton` to show sync status as a badge.

**Rejected**: overloads AuthButton's job ("are you signed in") with sync state ("is sync working"). Separate concerns → separate components. Chip mounts adjacent to AuthButton in the header; on mobile they share a row (chip 24px + AuthButton existing ~120px = fits comfortably in iPhone SE 320px width).

States and colors:

| State | Icon | Color | Trigger |
|---|---|---|---|
| 已同步 | 🟢 | green | last push AND last pull completed < 60s ago without error |
| 同步中 | 🟡 | amber | push or pull in flight |
| 同步失敗 | 🔴 | red | last attempt errored AND retry pending |
| 離線 | ⚪ | gray | navigator.onLine === false |
| 已暫停 | ⏸ | gray | gateState === 'paused' OR 'keep-separate' |
| 未登入 | (hidden) | — | authStatus !== 'authed' (chip doesn't render) |

Tap opens detail popover with last-synced timestamp + Force Push / Force Pull buttons (small, since these are advanced controls).

### D4. Sync error toast threshold — 2 consecutive failures (chosen)

**Considered thresholds**:

- 1 failure: too noisy — single timeouts on flaky mobile networks happen frequently
- 3+ failures: too quiet — user might play for minutes thinking sync is fine
- **2 consecutive failures** (chosen): catches real problems (auth expired, RLS misconfig, schema drift) while tolerating transient network blips

Existing cloud-sync spec L150 says "console.warn only unless repeated > N times — exact threshold in design.md". This design fills in N = 2.

Toast wording: 「同步失敗：[short reason]。資料安全保留在本機。點此重試」. Tapping triggers `__sync.pushAllNow()` + `pullAllNow()`. Toast auto-dismisses after 10s; doesn't re-appear for same error within 60s (debounced).

### D5. `__sync.diagnose()` — DEV handle + production bug-report capture (chosen)

The DEV global handle `globalThis.__sync` already exists (stripped from prod). Adding `diagnose()` to it has zero prod cost.

For bug-report context capture, we need the same data in prod. Solution: extract `diagnose()` implementation into `Engine.getDiagnosticSnapshot()` (regular method, always available), have the DEV global thin-wrap it, AND have `services/bug-report.ts` call it directly when building the submission payload.

Snapshot shape:

```ts
type SyncDiagnostic = {
  gateState: GateState
  authStatus: 'unauthed' | 'authed' | 'pending'
  currentUserId: string | null
  lastSignedInUserId: string | null  // from db.meta
  lastPushAt: number | null          // epoch ms
  lastPullAt: number | null
  queueDepth: number                  // pending operations
  recentErrors: Array<{ at: number; op: 'push' | 'pull'; table: string; message: string }>  // ring buffer last 5
  dbRowCounts: Record<string, number>  // per synced table
}
```

This is ~500 bytes JSON serialized — negligible bug_reports row size impact.

### D6. Mobile sync banner reflow — CSS-only stacking + email collapse (chosen)

**Considered**: JS-driven layout switch with `window.matchMedia`. **Rejected**: extra render path, fights React reconciliation. CSS-only is the right shape.

**Chosen**: in `styles.css`, add `@media (max-width: 639px)`:

```css
.sync-paused-banner {
  flex-direction: column;
  align-items: stretch;
}
.sync-paused-banner__text {
  width: 100%;
  min-width: 200px;  /* prevents per-character wrap */
  white-space: normal;
}
.auth-button__email {
  display: none;  /* mobile: collapse email pill */
}
.auth-button__email-collapsed {
  display: inline;  /* mobile: show ☁️ icon only */
}
```

Tap on the collapsed email icon SHALL open the SettingsPanel (where full email is visible). This is a one-line `onClick` add to AuthButton.

The `min-width: 200px` is critical — without it, even with column layout the text inside could still get squeezed by inner padding / button siblings. 200px chosen from iPhone SE 320px viewport - 2 × 16px gutter - safety margin.

### D7. `bug_reports.sync_metadata` — JSONB, nullable, opt-out (chosen)

**Considered**: dedicated typed columns (`gate_state TEXT`, `last_push_at TIMESTAMPTZ`, etc.). **Rejected**: schema rigidity makes it hard to evolve `SyncDiagnostic` shape; JSONB is the natural fit for observability snapshots.

The new column is nullable. The auto-context modal checkbox (default checked) controls whether snapshot is included. When unchecked, INSERT payload omits the field → server stores NULL. Same pattern as existing `game_state` / `user_agent` / etc.

## Edge cases

### Account-switch edge cases

- **User A signs out, comes back later as User A again**: `last_signed_in_user_id === current.user.id` → no AccountSwitchPrompt, normal flow. ✓
- **User A signs out, signs in as User B, signs out, signs in as User A**: B's last_signed_in stays in meta. When A signs back in, `current=A, last=B` → AccountSwitchPrompt fires. A picks 「使用雲端」 → A's cloud data is pulled, A's local (which is actually B's leftover) is replaced. ✓ (handles round-trip)
- **Family-shared device**: each sign-in triggers AccountSwitchPrompt → friction is the feature. User should pick 「清空本地」 every time on shared device. Future enhancement: 「記住此選擇 30 天」 checkbox (out of scope this round).
- **User signs in offline**: AccountSwitchPrompt can't verify cloud row count → modal degrades to "online check pending; you can defer or sign out" state. Existing offline-queue behavior preserved.

### Gate race edge cases

- **Local writes during the 5s re-evaluation window**: only `players.put('p1', ...)` triggers re-eval (not every Dexie write — would be too noisy). Player object materialization is the canonical hydration signal.
- **Multiple re-evaluations in 5s window**: debounced to one re-eval at end of window.
- **User signs out during 5s window**: window watcher is cancelled in `useSync` cleanup.

### Mobile banner edge cases

- **Email collapsed but user wants to see full email**: SettingsPanel always shows full email + last-synced + sign-out. Existing surface — no new code path needed.
- **Banner + status chip both present on mobile**: stack order is `[status chip row] / [banner full-width below]`. Both readable without overlap.

## Why no new shared package

Considered moving sync-engine code to `packages/core/src/lib/sync/` so 一階 + 二階 share more. **Rejected** for this hotfix: the per-app Dexie schema is different (HospitalDB vs StudyRpgDB), and refactoring the shared package now would balloon the change. Cross-app code duplication is acceptable here; can be DRYed in a future architectural change (`extract-sync-engine-to-core`).

## Why bundle observability with bug fixes

Three reasons:

1. **Same surface area**: status chip / error toast / diagnose / sync_metadata all touch the same files as the bug fixes
2. **Same verify pass**: testing the bug fixes already requires exercising sync states; adding observability tests is incremental
3. **Future bug-report value**: next time a user files "sync is broken", the `sync_metadata` snapshot makes triage 30 seconds instead of hours

Splitting observability into a follow-up change loses these compounding benefits.

## Rollback plan

If the account-switch detector misfires in production (e.g., false-positive triggering on returning users):

- Disable via `VITE_ACCOUNT_SWITCH_DETECTOR=false` env flag (defaults true)
- Existing sign-in flow continues to work without it (degrades gracefully to original behavior — Bug 2 returns but no new breakage)
- Hotfix release within hours

The gate race fix is harder to disable surgically; if it causes a regression we revert the change and lose Bug 1 fix.
