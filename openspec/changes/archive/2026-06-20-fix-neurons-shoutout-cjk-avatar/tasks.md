# Tasks — fix-neurons-shoutout-cjk-avatar

## 1. Relax the avatar id charset (both validators)

- [x] 1.1 `cloudflare/sync-worker/src/shoutout.ts`: `ASSET_ID_PATTERN` → `/^[\p{L}\p{N}._:-]{1,64}$/u` (+ comment)
- [x] 1.2 `packages/core/src/lib/shoutout.ts`: `ASSET_ID_PATTERN` → `/^[\p{L}\p{N}._:-]{1,64}$/u` (+ comment); rebuild core dist
- [x] 1.3 Sanity-check the regex: CJK / ASCII pass; URL / markup / whitespace / emoji / >64 chars reject

## 2. Frontend clarity

- [x] 2.1 `ShoutoutBoardPage.errorMessage()`: add `case 'invalid_avatar'` → 「頭像資料有誤，請重新選一隻神經元」

## 3. Regression lock

- [x] 3.1 `shoutout-moderation.test.ts`: assert the real CJK family ids (寄生蟲學 / 藥理學 / 公共衛生學 / 生物化學 / 微生物學) are accepted
- [x] 3.2 Assert whitespace / angle brackets still rejected under the Unicode-letter charset
- [x] 3.3 `pnpm --filter @study-rpg/neurons-tw test` green (637 tests); typecheck (neurons + core + worker) clean

## 4. Deploy + verify (owner-gated)

- [ ] 4.1 Redeploy the shared sync Worker (`cloudflare/sync-worker`)
- [ ] 4.2 Live verify: a neurons write with a CJK `assetId` now returns `200 ok` (was `400 invalid_avatar`)
- [ ] 4.3 Deploy the neurons app (carries the `invalid_avatar` message + core mirror)
- [ ] 4.4 Confirm 二階 (`m2`) shoutout unaffected (ASCII doctor ids still post)
