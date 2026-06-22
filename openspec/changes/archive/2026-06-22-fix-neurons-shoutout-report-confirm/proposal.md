# Fix neurons shoutout: confirm before reporting a message

## Why

A player reported (against the 二階 board, bug `4fc7c4dc`) that the 留言區 report
flag fires immediately on tap — 「不小心按到檢舉留言的小旗子就會直接送出⋯應該要先跳一個確認視窗，不然也太容易按」.

The neurons shoutout board was ported from the 二階 board and carries the **same
defect**: in [`ShoutoutBoardPage.tsx`](../../../apps/neurons-tw/src/routes/ShoutoutBoardPage.tsx),
each card's report control (`⚐`) wired `onClick={() => onReport(m.authorKey)}`
straight to `handleReport`, which immediately `POST`s the report via
`reportShoutout()`. A single accidental tap submits an irreversible report (and,
past the moderation threshold, can hide another player's message). There was no
confirmation step and no preview of which message is being reported.

## What Changes

- Make reporting a **two-step** action on the neurons board: tapping a card's
  report control now opens a confirmation dialog (`ReportConfirmModal`) instead
  of submitting. Only the dialog's 「確定檢舉」 button calls `reportShoutout()`.
- The dialog previews the targeted message text so the player can confirm they
  are reporting the right card, and offers 「取消」 (plus backdrop / Esc-equivalent
  dismissal) which submits nothing.
- Presentation-only guard: the report **service** (`reportShoutout`), the Worker,
  Dexie, R2 bundles, `SYNCED_META_KEYS`, and the leaderboard are untouched. No
  schema, sync, or backend surface changes.

## Impact

- Spec: `neurons-shoutout-board` — MODIFY 「Report a message」 to require a
  confirmation step before a report is submitted.
- Code: `apps/neurons-tw/src/routes/ShoutoutBoardPage.tsx` only.
- No Dexie / R2 / Worker / D1 / economy changes → Dexie fixture lint is a no-op.
- The identical 二階 defect is tracked separately and fixed in the standalone
  `study-rpg-2nd` repo (its own bug report `4fc7c4dc`).
