# Fix neurons shoutout: accept CJK avatar asset ids

## Why

A player reported 留言功能無法使用 (the shoutout board cannot be used). Diagnosis
(verified live against prod with the owner's session):

- The neurons content pack's canonical sprite ids — the family ids the
  `ShoutoutBoardPage` sends as `avatar.assetId` — are **Chinese** (`藥理學`,
  `寄生蟲學`, `公共衛生學`, …).
- Both the shared Worker (`cloudflare/sync-worker/src/shoutout.ts`) and the
  `@study-rpg/core` mirror validated `assetId` against an **ASCII-only**
  `ASSET_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/`.
- Every neurons write therefore failed `parseAvatar` → the Worker returned
  `{ error: "invalid_avatar" }` (HTTP 400). `ShoutoutBoardPage.errorMessage()`
  has no case for `invalid_avatar`, so the player saw the generic
  「送出失敗，請稍後再試」.
- Net effect: **no neurons player could ever post** — the board has been stuck
  at `count: 0` since launch (2026-06-09).

Live proof under the owner's account: `assetId: '寄生蟲學'` → `400 invalid_avatar`;
`assetId: 'subject-test'` (ASCII) → `200 ok`. The owner's account was otherwise
fully eligible (nickname set, neurons owned) — the only blocker was the charset.

Root cause of the gap: the validation test fixture used an idealized ASCII slug
(`'dopamine'`) that the app never actually sends, so the ASCII-only pattern was
never exercised against a real CJK id.

## What Changes

- Relax `ASSET_ID_PATTERN` in **both** the Worker and `@study-rpg/core` to
  `/^[\p{L}\p{N}._:-]{1,64}$/u` — permit Unicode letters/numbers (so non-ASCII
  canonical sprite ids like the neurons CJK family ids pass) while still
  excluding whitespace, quotes, slashes, angle brackets, and control chars
  (the injection guard — URL / markup / oversized — is unchanged). The 二階
  (`m2`) doctor ids are ASCII and are unaffected (the change is strictly more
  permissive).
- Add an `invalid_avatar` case to `ShoutoutBoardPage.errorMessage()` so any
  future avatar rejection surfaces a clear message instead of the generic one.
- Fix the regression gap: the `isValidAvatar` test now asserts the **real** CJK
  family ids the neurons app sends are accepted, and that whitespace / angle
  brackets are still rejected under the Unicode-letter charset.

## Impact

- Affected specs: `shoutout-board-backend` (MODIFIED: Structured avatar payload
  validation — charset permits Unicode letters/numbers).
- Affected code: `cloudflare/sync-worker/src/shoutout.ts`,
  `packages/core/src/lib/shoutout.ts`,
  `apps/neurons-tw/src/routes/ShoutoutBoardPage.tsx`,
  `apps/neurons-tw/src/__tests__/shoutout-moderation.test.ts`.
- **Deploy**: the shared sync Worker MUST be redeployed (`cloudflare/sync-worker`)
  — this is the change that actually unblocks posting. The neurons app carries
  the `invalid_avatar` message + core mirror. Backward-compatible for 二階
  (ASCII ids); no D1 schema / migration change.
- L1 hotfix: feature was broken for all neurons players since launch.
