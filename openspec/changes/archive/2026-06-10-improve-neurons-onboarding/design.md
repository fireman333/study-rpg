## Context

神經元（neurons-tw）目前的新手 onboarding 是 [`HomepageOnboarding.tsx`](apps/neurons-tw/src/components/HomepageOnboarding.tsx) 一張靜態四步卡（gated on `meta['homepageOnboardingDismissed']`）＋ HelpMenu 詳解 ＋ 出征鈕的 hover tooltip。盤點（grill 紀錄 `~/.claude/scratch/grilled-神經元-onboarding-改造-2026-06-10.md`）發現四個會在宣傳帶量時造成流失的缺口：出征好處只藏在 tooltip / HelpMenu；0 錯題新玩家的出征鈕是灰掉死按鈕「無錯題」、無解鎖提示；靜態卡四步等權重無順序；用詞偏 jargon。

**既有事件面（只訂閱、不改）**：
- `lib/maze/answer-feedback`：`emitAnswerCorrect(familyId)` / `emitAnswerWrong(familyId)`（[connectome.ts:236](apps/neurons-tw/src/lib/services/connectome.ts#L236) / [:443](apps/neurons-tw/src/lib/services/connectome.ts#L443)）。
- connectome `events` bus：`connectome.variantSlotUnlocked`（= 抽出一隻神經元，[connectome.ts:61](apps/neurons-tw/src/lib/services/connectome.ts#L61)）。
- `lib/maze/maze-focus`：`onMazeFocus` walker 聚焦（[maze-focus.ts:26](apps/neurons-tw/src/lib/maze/maze-focus.ts#L26)）。

**首節點可達性（已驗）**：第一次 settle = `nodeCost(0)` = 11 能量（[economy.ts:58](apps/neurons-tw/src/lib/maze/economy.ts#L58)）；每答對 +3（新玩家無加成，[maze-constants.ts:18](packages/content-neurons-tw/src/maze-constants.ts#L18)）→ 約答對 4 題即抽出第一隻神經元。引導終點合理、不需動核心數值。

**約束**：3–5 天衝完；不 bump Dexie schema（純 `meta` key）；手機 first；不動 walker/能量/gacha 核心；驗收走 dogfood + 1–2 同學試玩（不埋 telemetry）。

## Goals / Non-Goals

**Goals:**
- 新玩家第一個 session 內，**主動**而非被動地理解：唸書/答題 → walker 在腦圖前進 → 抵達節點 → 抽出第一隻神經元（收集 hook）。
- 在玩家**第一次答錯的當下**，把錯題出征的好處（修復腦圖連線＋抽 DMN 命運卡）講清楚，補上 #1 缺口。
- 出征鈕對全新玩家不再是看似壞掉的灰按鈕。
- 引導可跳過（尊重不耐被牌手的醫學生）、可從 HelpMenu 重播。

**Non-Goals:**
- 不寫腳本化 tutorial engine（強制分支步驟、自製 step state machine）。
- 不改 walker / 能量 faucet / gacha / settle 任何核心邏輯。
- 不 bump Dexie schema、不動 R2 bundle、不加跨裝置 sync。
- 不加 telemetry / 分析埋點。
- 不重做 HelpMenu 整體（只加重播入口＋吸收被移出首屏的深度術語）。

## Decisions

### D1：兩個互補的 onboarding moment（而非單一條引導）
引導終點選「抽到第一隻神經元」（收集 hook），但出征鈕「答錯才出現」、而出征又是 #1 缺口 —— 若引導全程答對，玩家走完也沒看過出征。因此拆成 **(A) 互動引導層**（帶到抽出第一隻神經元）＋ **(B) 出征解鎖聚光**（首次答錯時教好處）。兩者拼起來才同時滿足收集 hook 與補出征缺口。
- *Alternative*：把出征塞進單一條線性引導 → 必須人為製造一次「答錯」，contrived 且要動答題流程；否決。

### D2：非阻斷式 coachmark 覆蓋層，觀察既有事件推進（非腳本化 engine）
引導層是一個 overlay，訂閱既有事件（`emitAnswerCorrect` / `connectome.variantSlotUnlocked` / `onMazeFocus`），每一步聚光「下一個該做的動作」，玩家**自然做出該動作**時前進到下一步。不攔截輸入、不替玩家點擊。
- *Why*：(1) 壓得進 3–5 天（沒有自製 step engine / 模擬點擊）；(2) 尊重老手（隨時可跳）；(3) 不動核心（純觀察）。
- *Alternative*：阻斷式 modal coachmark（必須照步驟點）→ 工程量大、惹怒想直接玩的人；否決。

### D3：引導四步，終點 = 抽出第一隻神經元
步驟：① 提示答第一題（或開始閱讀）→ ② 答對後聚光 walker「牠在腦圖上前進了」→ ③ 提示「再幾題就到第一個腦區」→ ④ `variantSlotUnlocked` 觸發 → 慶祝「你抽出了第一隻神經元！」並結束引導。步驟推進綁 `variantSlotUnlocked` 這個終點事件，因此玩家用答題或閱讀任一路徑到達都成立。
- 首屏文案白話（「答題讓腦圖長大」），不出現 growth cone / 白質束 / wire 等術語。

### D4：出征鈕改 one-way reveal（首次答錯揭露，之後常駐）
全新玩家（從未答錯過）**隱藏**出征鈕；玩家**第一次答錯**時，鈕浮出＋光暈，並一次性彈出 benefit 聚光。揭露後永久常駐（即使之後清空錯題，回到既有的 disabled「無錯題」狀態，不再隱藏）。
- 可見條件：`hasEverAnsweredWrong` = `questionHistory` 任一列 `everWrong === true`。`everWrong` 是 monotonic，本身即持久的 one-way latch、也是改動前就有錯題的舊玩家的 backstop，故**不需**獨立 `expeditionRevealed` flag（早期版本有此 flag，但 write-only、被 `everWrong` 衍生取代，已於 `/simplify` 移除）。
- *Alternative*：保留灰鈕＋加一行「答錯後解鎖」提示 → 仍有死 UI、且新玩家對「為什麼要製造錯題」無感；否決（grill 已選 reveal-on-wrong）。

### D5：兩 moment 的時序互斥
出征解鎖聚光在「互動引導層仍進行中」時**抑制**，延到引導完成或跳過之後、玩家首次答錯時才觸發。避免新玩家同時被兩個 overlay 轟炸。
- 實作：聚光觸發條件加 `guidedComplete`（見 D6）為前提；若引導期間就答錯，出征鈕仍即時揭露（由 `everWrong` 衍生，見 D4），但 benefit 聚光以 `pendingSpotlightRef` 延到引導結束/跳過後補放一次。

### D6：狀態模型 —— 純 device-local `meta` key（不 sync、不 bump schema）
onboarding 是一次性「體驗狀態」，不是跨裝置遊戲進度，故不進 `SYNCED_META_KEYS`、不 bump Dexie。鍵（mirror 既有 `HOMEPAGE_ONBOARDING_DISMISSED_KEY` pattern）：
- `neurons:onboarding:guidedComplete`（'true' = 引導已完成或跳過 → 不再自動顯示）。
- `neurons:onboarding:expeditionSpotlightSeen`（'true' = benefit 聚光已放過一次，one-shot）。
- 出征鈕的 one-way 揭露**不另設 flag**，由 monotonic `questionHistory.everWrong` 衍生（見 D4）。
- 帳號重置路徑清掉以上兩鍵（mirror 既有 reset 清 `homepageOnboardingDismissed`），讓 reset 玩家重新體驗。
- 既有 `homepageOnboardingDismissed` 隨靜態卡退役一併淘汰（reset 仍清它以相容舊存檔）。

### D7：術語漸進揭露 ＋ HelpMenu 重播入口
首屏白話；growth cone / 白質束 / 突觸 / Hebbian 等深度術語集中在 HelpMenu。HelpMenu 增一個「重看新手引導」入口：清 `guidedComplete` 後重跑引導層（或開一個 read-only 步驟回顧）。

### D8：退役靜態 `HomepageOnboarding` 四步卡
由互動引導層取代，避免兩套並存。元件可改名 / 收斂為引導層掛載點；保留 dismiss / 永不再現 / reset 重現語意（改由 `guidedComplete` 承載）。

## Risks / Trade-offs

- **[3–5 天 scope 偏緊]** → 嚴守 D2（觀察既有事件、不寫 engine）；引導步驟控制在 4 步；聚光用既有 motion-library primitive（`CelebrationHalo` / spotlight），不自製動畫。
- **[兩 overlay 撞車]** → D5 時序互斥規則；Chrome MCP 手機尺寸驗一次「引導中途答錯」的 path。
- **[出征鈕隱藏可能讓部分玩家更晚發現主玩法]** → 揭露時機（首次答錯）正是出征唯一有意義的時刻，且 benefit 聚光當場補足；反而比死灰鈕更早建立正確認知。
- **[derivation 成本]** → `hasEverAnsweredWrong` 是 `useMemo` over 既有 live `questionHistory`（dep `[questionHistory]`），每次 history 變更才重算一次（非每 render），`.some` 短路。
- **[reduced-motion]** → 聚光 / 慶祝在 `prefers-reduced-motion` 下退為靜態提示（mirror 既有 celebration 元件）。

## Migration Plan

- 純 client UI＋`meta` key，無資料遷移、無 schema 變更、無後端動作。
- 上線即生效：既有玩家 `guidedComplete` 不存在 → 但 `hasEverAnsweredWrong` backstop 命中（多半已有錯題）→ 出征鈕照常顯示、不被隱藏；引導層對既有玩家會出現一次（可立即跳過）。若不希望既有玩家看到引導，可在初始化時對「已有任何 maze settles / 已答題」的存檔預設 `guidedComplete='1'`（migration 友善預設，寫進 tasks）。
- **Rollback**：revert 本 change 的 commit 即可（無持久化破壞性變更）；殘留的 `neurons:onboarding:*` meta key 無害。

## Open Questions

- 引導層對「已是老玩家」的存檔是否要自動視為完成？建議是（初始化時若偵測已有 settles/答題紀錄則預設 `guidedComplete='1'`），寫進 tasks 由 apply 階段確認。
- HelpMenu「重看新手引導」是重跑互動引導層、還是開一個靜態步驟回顧？傾向重跑（複用同元件），apply 時定。
