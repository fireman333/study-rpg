# Tasks — add-neurons-handout-bank-subtab

- [x] 1.1 `apps/neurons-tw/src/App.tsx`: append `{ to: '/cram/handout', label: '考前講義' }` to `SUBTAB_GROUPS.bank` (after 題庫 and 考前猜題). Confirm `/cram/handout` route already exists (outside `AnimatedRoutes`) and `BANK_GROUP_PATHS` already covers it via `startsWith('/cram/')` (no change needed). typecheck clean.
- [x] 1.2 dev browser verify: 題庫 sub-tab bar shows 3 pills (題庫 / 考前猜題 / 考前講義); clicking 考前講義 navigates to `/cram/handout` and launches the handout scene; 題庫 top tab stays active. (Verified with embryology e2e pass.)
