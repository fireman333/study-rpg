## 1. Helper function — Taiwan-time aware refresh label

- [x] 1.1 Create new file `apps/medexam2-hospital-tw/src/lib/daily-ticket.ts` exporting one pure function `getNextDailyRefreshLabel(now: Date, available: number, cap: number): string` — uses `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false })` for Taiwan-hour extraction
- [x] 1.2 Added file-top JSDoc explaining Taiwan-pinned timezone decision (per design D1) and cross-ref to `recruitment-gacha` spec UI affordance sub-clause
- [x] 1.3 SKIPPED defensive `cap >= available` assert — TypeScript signature is strict and helper has 1 caller that uses domain constants; YAGNI per coding_principles.md "Simplicity First"

## 2. HomePage integration

- [x] 2.1 Imported `getNextDailyRefreshLabel` from `../lib/daily-ticket` in HomePage.tsx
- [x] 2.2 After `ticketsAvailable` extraction, compute `const refreshLabel = getNextDailyRefreshLabel(new Date(), ticketsAvailable, TICKET_CAP)` — re-evaluates on every render, correct since `new Date()` reflects current time so prefix auto-flips when player crosses 08:00
- [x] 2.3 `.ticket-counter` span updated: added `title="每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張"` + nested `<span className="ticket-counter__refill"> · {refreshLabel}</span>` after the count figure

## 3. HelpMenu §recruitment copy update

- [x] 3.1 Located `recruitment` section body[0] in `SECTIONS` (HelpMenu.tsx:55)
- [x] 3.2 Rewrote body[0] to specify 「每日台灣早上 08:00 自動發放 +1 張免費招募券（持有上限 99）」 matching HomePage tooltip wording verbatim
- [x] 3.3 body[1] (pity rules) unchanged

## 4. Typecheck + dev smoke

- [x] 4.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — clean (tsc --noEmit zero errors)
- [x] 4.2 Dev server on `localhost:5174/study-rpg/hospital/`, Chrome MCP smoke: ticket-counter displayed `🎟️ 14 / 99 · 明日 08:00 +1` (Taiwan hour at test time = 8, helper correctly returned `明日 08:00 +1` since `taiwanHour < 8` is false)
- [x] 4.3 Confirmed `title="每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張"` attribute on `.ticket-counter` span via DOM inspection
- [x] 4.4 Patched IDB `tickets.available = 99` + hard-reloaded → display read `🎟️ 99 / 99 · 已滿` (countdown suffix correctly replaced by 已滿 per cap-99 edge case)
- [x] 4.5 Restored `tickets.available = 14` (original pre-test value); zero console errors observed throughout
- [x] 4.6 HelpMenu §recruitment body rendered: 「每個科別有「親和值」門檻 — 答對該科考古題達門檻後，招募 banner 解鎖。每日台灣早上 08:00 自動發放 +1 張免費招募券（持有上限 99）；用券抽 P5/P4/P3/P2/P1 醫師（rarity 越高機率越低）。」 — matches HomePage tooltip verbatim on the daily-ticket clause

## 5. Verify

- [x] 5.1 Run `/opsx:verify` — passed: 0 critical / 0 warnings / 0 suggestions; design D1-D6 all followed; all 4 new scenarios cross-checked against code + Chrome MCP captures
- [ ] 5.2 Prod smoke deferred until post-deploy: hard-reload `https://fireman333.github.io/study-rpg/hospital/`, confirm ticket-counter chip and HelpMenu wording

## 6. Archive

- [x] 6.1 `openspec validate clarify-daily-ticket-ux` — pass
- [x] 6.2 Run `/opsx:archive` to sync delta into both `openspec/specs/recruitment-gacha/spec.md` (UI affordance sub-clause + 3 new scenarios appended after existing 5 — total 8 scenarios under Req) and `openspec/specs/hospital-tutorial/spec.md` (daily-ticket cadence sub-clause + 1 new scenario「Recruitment copy quantifies daily ticket grant」 appended after existing scenarios), move folder to `archive/2026-05-19-clarify-daily-ticket-ux/` — done
- [ ] 6.3 Commit (template: `spec(archive): merge clarify-daily-ticket-ux — HomePage ticket-counter shows next-refresh time + HelpMenu §recruitment quantifies daily +1 / cap 99 / 台灣 08:00`) — explicit user confirm before `git commit`; stage only `HomePage.tsx` + `lib/daily-ticket.ts` + `HelpMenu.tsx` + 2 spec.md + archive folder (exclude parallel session WIP)
