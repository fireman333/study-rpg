# 決定索引（一行一條；/opsx-auto 合併時追加）

## 遊戲方向與設計原則
- 北極星是「走路種花」式的收集（讀書答題＝種花，圖鑑綁讀書當下的情境），不走即時戰略 （2026-06-01-neurons-pikmin-bloom-direction, 2026-06-01）
- 不做懲罰、永久死亡、答對加成這類會鼓勵刷分或懲罰沒讀書的機制 （2026-06-01-neurons-pikmin-bloom-direction, 2026-06-01）
- 遠征只做「派出的小隊會帶出該科到期或答錯的題目」，目的是多讀書，不是倍率 （2026-06-01-neurons-pikmin-bloom-direction, 2026-06-01）
- 任何幫玩家逃避誠實面對的機制都拿掉：連對保護盾（streak-shield）移除 （2026-06-04-neurons-progression-systems-roadmap, 2026-06-04）
- 保留：每日連續獎勵、斷連續只通知不隱藏、「我亂猜的／太簡單」自評按鈕 （2026-06-04-neurons-progression-systems-roadmap, 2026-06-04）
- 做題完成後不加壓力語言；不做考前倒數與衝刺模式 （2026-07-06-cram-prescription-integration, 2026-07-06）
- 不把考前猜題塞進今日處方箋（處方箋每天凍結，不可被外部題目改動） （2026-07-06-cram-prescription-integration, 2026-07-06）
- 處方箋卡片只放一個低調的「考前？看高頻考點」入口；考前猜題作答會順便算進今日處方箋 （2026-07-06-cram-prescription-integration, 2026-07-06）

## 收集與圖鑑
- 收集上限固定 55 款（11 個科別家族 × 5 款），圖鑑顯示已收集與未收集剪影 （2026-06-02-rework-neurons-open-collection, 2026-06-02）
- 移除圖鑑頁隨時手動抽卡，收集的唯一新來源是迷宮節點探索 （2026-06-02-rework-neurons-open-collection, 2026-06-02）
- 收集重置一次（乾淨起點），但保留神經能量與讀書進度 （2026-06-02-rework-neurons-open-collection, 2026-06-02）
- 同一款神經元依「誕生情境」顯示不同造型的做法暫緩，要先鎖定情境對應美術規格再批次生圖 （2026-06-01-neurons-pikmin-bloom-direction, 2026-06-01）
- 連結神經元：每一對科別第一次連線變強時解鎖一隻，共 55 隻，不是抽卡、也不算第 12 個科別 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 連結神經元美術用 14 款通用造型分配到 55 組，不做每組專屬圖 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）

## 迷宮、遠征與連線
- 迷宮是一張可縮放的方形複雜格子迷宮，11 個科別家族從邊界不同入口進入 （2026-06-05-redesign-neurons-maze-rotjs-grid, 2026-06-05）
- 迷宮提升為首頁 （2026-06-03-promote-maze-to-home, 2026-06-03）
- 神經連線只在「遠征中答對先前答錯的題」時形成，一般練習與整卷模考不算 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 某科當天修復滿 2 題算「今日修復」，一天有效遠征需修復總數 ≥5 才處理連線，每天最多處理 3 對 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 連線不用時 7 天降一級（不是 14 天），降到休眠但不刪除 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 連續天數同時顯示「本週 X/7」，漏一天不歸零 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 不做「走失路徑」懲罰；不做各科獨立的髓鞘第二套加成 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 遠征與百題模考分成兩個入口：遠征建立連線、模考不產生連線 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）
- 五個連線改版變更的上線順序已鎖定，教學引導放最後 （2026-06-08-connectome-conduction-roadmap, 2026-06-08）

## 補給品、裝備與獎勵
- 四層進度各管一條路：能量、精通、裝備（永久被動）、補給品（一次性）；補給品不得發永久加成、加速或續航 （2026-06-04-neurons-progression-systems-roadmap, 2026-06-04）
- DMN 抽卡改為休息態認知類補給品，背包全部手動啟用 （2026-06-04-neurons-progression-systems-roadmap, 2026-06-04）
- 裝備維持「每件只拿一次」、固定 5% 機率，不加保底 （2026-06-30-make-neurons-dmn-consumables-repeatable, 2026-06-30）
- 遠征獎勵：把 DMN 抽卡時間軸改綁遠征（原本綁閱讀） （2026-06-04-add-neurons-expedition-rewards, 2026-06-03）

## 題庫與內容
- 先完全做完二階再做一階（二階優先、一階暫緩） （2026-05-19, 2026-05-19）
- 一階國考版本沒有真實玩家，移除；神經元保留原網址，/1st/ 直接 404 （2026-06-03-remove-medexam-tw-and-promote-neurons, 2026-06-03）
- 二階程式碼已拆到獨立 repo，之後二階只改獨立 repo，不改這裡的舊副本 （2026-06-03, 2026-06-03）
- 題庫約 1132 題「否定式題幹」的標記規則不再全面重寫，接受兩種規則並存（答案欄位都正確） （2026-05-20-stage3-abandoned, 2026-05-20）
- 每題的選項簡答由 AI 產生並用另一批 agent 驗證，放在原本詳解的位置，保留「看原始詳解 PDF」按鈕 （2026-06-28-neurons-simplified-explanations, 2026-06-28）
- 考前講義做成跨科通用（組織學 → 胚胎學 → 病理學 → 藥理學）；胚胎學分 4 個發育區，已由使用者確認切法 （2026-07-10-neurons-subject-handouts-generalization, 2026-07-10）
- 考前猜題資料可一鍵下載 A4 PDF，完全開放不需登入 （2026-07-06-add-neurons-cram-tab, 2026-07-06）

## 帳號、資料與部署
- 暫停「把登入搬離 Supabase 到 Cloudflare」的大提案並刪除（前提已過期，Supabase 反而在擴充） （2026-08-02-retiring-the-cloudflare-auth-migration, 2026-08-02）
- 匿名進度被登入帳號收編時，雲端優先、不跳選擇畫面 （2026-07-08-add-neurons-rescue-anon-authed-claim, 2026-07-08）
- 排行榜把玩家 ID 改為雜湊後再公開，不暴露原始 ID （2026-09-24-hash-leaderboard-user-ids, 2026-09-24）
- 排行榜等級欄改用短稱（診所／區域／醫中／大廟），並補上第四級 （2026-05-24, 2026-05-24）
- 對外部署（合併到主線＝上線）、會改變使用者看到的畫面時，要使用者確認 （2026-07-12-reorder-handout-subjects-by-exam-paper, 2026-07-12）
