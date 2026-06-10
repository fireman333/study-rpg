## 1. Platform-adaptive DPR cap (D1)

- [x] 1.1 Added module-level `IS_SAFARI_OR_IOS` UA heuristic (WebKit-but-not-Chrome/CriOS/Chromium/Android/Edg/FxiOS, OR iOS incl. iPadOS-as-Mac-with-touch) + `MAZE_DPR_CAP = IS_SAFARI_OR_IOS ? 1.5 : 2`.
- [x] 1.2 `resize()` now uses `Math.min(MAZE_DPR_CAP, devicePixelRatio)`; `imageSmoothingEnabled = false` kept. Chrome verified to still resolve DPR cap 2.

## 2. Memoize edge-feather gradients (D2)

- [x] 2.1 Added a closure-scoped `featherCache` ({w,h,grads}) in the draw effect.
- [x] 2.2 Layer ⑦ rebuilds the four gradients only when `w`/`h` change (resize); reuses the cache every other frame. Identical visual output (same coords, same OUTSIDE→OUTSIDE_T stops).

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (561 passed).
- [x] 3.2 Chrome functional non-regression: app boots, maze canvas mounts, no error boundary; `detected_SAFARI_OR_IOS = false` on Chrome and the canvas backing store is 1520 = 760×**2** (Chrome keeps DPR cap 2 — detection does NOT misflag Chrome); only the pre-existing unrelated `variant-gacha` console error appears. (Canvas pixel output / Safari path not headlessly verifiable — background rAF throttle + no Safari device.)
- [x] 3.3 **Owner verifies Safari/iOS** (Mac + iPhone) post-deploy: maze pans/zooms more smoothly; tiles still crisp. Tunable: the Safari DPR value (1.5 ↔ 1.75) is the single `MAZE_DPR_CAP` constant.
- [x] 3.4 Zero schema/sync/economy/routes change; `lint:dexie-fixtures` no-op. `/simplify` skipped — a detection const + a gradient memo have nothing to reuse/simplify; dead-code clean via `noUnusedLocals` typecheck.
