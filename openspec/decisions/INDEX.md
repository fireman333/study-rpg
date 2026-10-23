# 決定索引（一行一條；/opsx-auto 合併時追加）

## 產品範圍與方向
- 一階 medexam-tw 退場、二階獨立成自己的 repo，這個 repo 只留神經元（neurons-tw）為主力 （2026-06-03-remove-medexam-tw-and-promote-neurons, 2026-06-03）
- 二階獨立後網址仍維持 med-study-rpg.com/2nd/，既有雲端存檔與登入不受影響 （2026-06-03-split-medexam2-standalone, 2026-06-03）
- 腦迷宮（maze）扶正成主頁，舊的 connectome 樹狀畫面下架但突觸機制保留 （2026-06-03-promote-maze-to-home, 2026-06-03）
- 迷宮節點是唯一抽卡閘門，不再有隨時手動抽卡的入口 （2026-06-03-promote-maze-to-home, 2026-06-03）
- 神經元「考前講義」為各科逐科擴充，內容須 100% 以題庫為依據，owner 逐章審過才定稿 （2026-07-10-add-neurons-anatomy-handout, 2026-07-10）
- 講義與押題內容的單元對應只做到科目層級，不硬綁單元 （2026-07-12-add-neurons-handout-unit-correspondence, 2026-07-12）
- 早期二階醫院模式採「經營醫院規模與聲望」玩法，保留 GBA 像素風 （2026-05-15-add-hospital-mode-scaffold, 2026-05-15）
- 擱置的 Cloudflare 自建登入遷移提案已刪除退場（Supabase 仍是登入與社群筆記的基礎） （decisions/2026-08-02-retiring-the-cloudflare-auth-migration.md, 2026-08-02）

## 玩法與獎勵規則
- 出征（清錯題）獎勵改為驅動 DMN 抽卡，而不是灌迷宮能量 （2026-06-04-add-neurons-expedition-rewards, 2026-06-03）
- 出征抽卡門檻用「清掉目前錯題的 25%、50%」並設上下限，每天最多 2 抽 （2026-06-04-add-neurons-expedition-rewards, 2026-06-03）
- 每次作答都會排進間隔複習，題目模式只決定選題，不決定要不要排程 （2026-06-04-add-neurons-quiz-mode-chips-and-srs, 2026-06-04）
- DMN 消耗品可重複抽到；裝備每件只能擁有一次，抽中機率固定 5%，不加保底 （2026-06-30-make-neurons-dmn-consumables-repeatable, 2026-06-30）
- 模擬考為練習模式，沒有倒數壓力，詳解全展開，交卷後錯題不自動進複習 （2026-05-15-add-mock-exam-mode, 2026-05-15）
- 每日處方箋第一版只把「沒做過的題」算成少寫的題，每日固定兩行、總量上限 12 題 （2026-07-04-add-neurons-daily-prescription, 2026-07-04）
- 每日處方箋分四階（基礎、追加固化、形成連結、深度出征），每天能量獎勵合計最多 70 （2026-07-07-add-neurons-prescription-tiers-and-sync, 2026-07-07）
- 弱點壓力第一版顯示在家族選擇卡上，不染迷宮畫面 （2026-07-07-add-neurons-weakness-radar-and-error-repair, 2026-07-07）
- 考點標籤（concept label）只在揭曉答案後顯示，作答中不顯示，避免劇透 （2026-07-06-add-neurons-concept-labels-in-quiz, 2026-07-06）
- 非讀書時的醫院事件觸發：還沒按「開始讀書」不算在讀書 （2026-05-26-rewire-hospital-events-to-non-reading-trigger, 2026-05-26）

## 資料保存與同步
- 神經元「重置帳號進度」只清神經元，同帳號的二階存檔不動 （2026-06-11-add-neurons-account-reset, 2026-06-11）
- 重置後要有跨裝置傳播標記，避免舊裝置把已清除的資料推回來復活 （2026-06-11-add-neurons-account-reset, 2026-06-11）
- 急救計畫（rescue）跨裝置同步，以「最後一個使用者動作」為準 （2026-07-08-add-neurons-rescue-r2-sync, 2026-07-08）
- 排行榜與留言板公開資料不再露出原始 user_id，改用雜湊 （2026-09-24-hash-leaderboard-user-ids, 2026-09-24）
- 排行榜公開欄位清單固定為既定的快照欄位，不含 Strong Synapse 數 （2026-09-24-neurons-leaderboard-snapshot-fields, 2026-09-24）

## 內容與詳解
- 詳解中的表格改存結構化區塊並渲染成真表格，不再用文字硬接 （2026-06-25-add-neurons-explanation-tables, 2026-06-25）
- 簡解格式：先放「簡解：」、分隔線、再接原本詳解 （2026-06-25-restore-neurons-jianjie-key, 2026-06-25）
- AI 生成的詳解必須標註「由 AI 生成，未經陽明審定」，並記錄來源為 ai-generated （2026-06-29-backfill-neurons-missing-explanations, 2026-06-29）
- 考前速查（cram）分頁完全公開、不設登入門檻，也可下載預先生成的 A4 PDF （2026-07-06-add-neurons-cram-tab, 2026-07-06）
- 原始詳解 PDF 的入口按鈕放在詳解摺疊區之外、之上，不必展開就能點 （2026-06-26-add-neurons-local-pdf-provenance, 2026-06-26）
- 神經元 Tauri 桌面殼後來移除 （2026-07-13-remove-neurons-tauri-shell, 2026-07-13）

## 介面與命名
- 二階醫師預設名依階級區分，沿用 owner 指定的 5 個字串（大P、主任、Senior V、Young V、R） （2026-05-19-differentiate-default-name-by-tier, 2026-05-19）
- 稀有度與階級一律用 P1 夯到 P5 拉完了的五階 （2026-05-15-wire-recruitment-gacha, 2026-05-15）
- 神經元模擬考模式正名為「模考」，每冊一份 100 題 （2026-06-08-split-neurons-expedition-exam-modes, 2026-06-08）
- 神經元部署（合併到 main 上線）由 owner 決定時機，動畫包與前一包一起部署 （2026-06-08-polish-neurons-juice-animations, 2026-06-08）
- 神經元的 Lofi 電台換成像素電台，舊電台音檔來源不再讀取 （2026-10-20-swap-neurons-radio-to-lofi-pixel-radio, 2026-10-20）
