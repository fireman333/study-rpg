# Tasks — Reduce the R2 412 retry storm (neurons)

> Scope = D2 + D4 only. D1 (push-only-dirty-bundles) and C1 (dual-mode dirty snapshot) are **N/A** for single-bundle pure-R2 neurons.

## 1. Persist push ETag — user-scoped, apply-safe (D2)

- [x] 1.1 `r2/etag.ts`: user-scoped `localStorage` persistence layered under an in-memory `Map`; key `neurons-rpg.sync.etag.<userId>` (no bundle segment). `getEtag(userId)` / `setEtag(userId, etag|null)` / `clearEtag(userId)` — `setEtag(_, null)` clears; `typeof localStorage` + try/catch guards (degrade to in-memory). Add `clearAllPersistedEtags()` (prefix-scan over `neurons-rpg.sync.etag.`). Do NOT port 二階's schema_version machinery.
- [x] 1.2 `r2/engine-r2.ts` pull path: MOVE the success-path `setEtag` to AFTER `applyBundleSnapshot` succeeds; the decode-fail branch keeps its `setEtag` (corrupt-blob recovery) but does not merge.
- [x] 1.3 `r2/engine-r2.ts`: both 404 branches (HEAD-404 + GET-404) call `clearEtag(userId)` so a deleted/reset blob → retry uses `If-None-Match: *`.
- [x] 1.4 Thread `userId` through `getEtag`/`setEtag`/`clearEtag` + add a `userId` param to `pushBundle`/`pullBundle` (no bundle param) + the internal `pullBundle` calls in the 412/428 retry; `engine.ts` `pushNow`/`pullNow` pass `this.user.id`. `pnpm -r typecheck` green.

## 2. Account-switch / wipe / reset clears etag + presign (D4)

- [x] 2.1 `account-guard.ts` `clearLocalSyncedData` calls `clearAllPersistedEtags()` (import from `./r2/etag`) + `clearPresignCache()` (import from `./r2/client`), alongside the existing Dexie + synced-meta clear. In-place reset (`services/account-reset.ts` → `clearLocalSyncedData`) is covered transitively (no separate edit).

## 3. Invariant regression guards

- [x] 3.1 Cold-start force-pull still bypasses the cached etag (`force` ⇒ `cachedEtag = null`, `engine-r2.ts` unchanged on that line).
- [x] 3.2 Corrupt-blob / first-ever recovery preserved — decode-fail keeps etag for `If-Match` overwrite; first-ever (no persisted etag) still sends `If-None-Match: *`. Full suite green.

## 4. Tests

- [x] 4.1 Add `apps/neurons-tw/src/__tests__/r2-etag-persistence.test.ts` (mirror 二階, node env → polyfill `localStorage`): persist under user-scoped key; reload-fallback (cold map reads localStorage); user-scoping (B never sees A's etag); `clearEtag` removes mem + persisted; `setEtag(null)` clears; `clearAllPersistedEtags` removes every etag; degrade-to-in-memory when `localStorage` undefined.

## 5. Spec + verify + measure

- [x] 5.1 `neurons-cloud-sync` spec delta written; `openspec validate reduce-r2-412-storm` = valid.
- [x] 5.2 `pnpm -r typecheck` green; `pnpm --filter @study-rpg/neurons-tw test` green (incl. new `r2-etag-persistence.test.ts`).
- [x] 5.3 codex code review of the apply diff (二階's review caught a real blocker).
- [ ] 5.4 Post-deploy `/verify` Chrome MCP live smoke: a synced mutation pushes with `If-Match` (not `If-None-Match: *`), 0 cold-start 412 (fetch-interceptor).
- [ ] 5.5 Post-deploy measurement: re-run the per-UTC-hour `PutObject userError` Analytics query (token `~/.cf-analytics-token`); record the step-down (expect a partial drop — in-session concurrency 412 is the deferred work's target).

## 6. Deferred (separate change — gate on §5.5)

- [ ] 6.1 Sync single-flight / startup-force-pull-before-push mutex.
- [ ] 6.2 Multi-tab leader election (Web Locks / BroadcastChannel). neurons' 3s debounce makes this relatively higher-value than in 二階.
