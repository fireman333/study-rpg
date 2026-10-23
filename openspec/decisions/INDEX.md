# 決定索引（一行一條；/opsx-auto 合併時追加）
<!-- 2026-10-23 一次性回填：只收使用者層級的決定 -->
## 二階醫院經營（hospital / medexam2）
- 唸書 session 是純計時模式、不在裡面答題；答題只在招募抽卡區進行，答對只增加親密度 （redesign-hospital-economy, 2026-05-17）
- 早期二階醫院模式採「經營醫院規模與聲望」玩法，保留 GBA 像素風 （2026-05-15-add-hospital-mode-scaffold, 2026-05-15）
- 醫院升級要同時滿足聲望夠高與醫師科別夠分散，並新增第 4 級「國家級教學醫院」 （redesign-hospital-economy, 2026-05-17）
- 醫師進修失敗只損失營收、醫師不會降級；同一位醫師連續失敗 5 次後第 6 次必成功 （redesign-hospital-economy, 2026-05-17）
- 醫師薪水跟能力倍率成正比，候補醫師也要扣薪 （redesign-hospital-economy, 2026-05-17）
- 聲望溢出轉成命運卡，連續 3 次衰運後第 4 次保證給好結果 （redesign-hospital-economy, 2026-05-17）
- 醫師稀有度只代表能力強弱（P1–P5），抽卡機率 60/25/10/4/1，30 抽保底 P3 以上、100 抽保底 P2 以上 （wire-recruitment-gacha, 2026-05-15）
- 稀有度與階級一律用 P1 夯到 P5 拉完了的五階 （2026-05-15-wire-recruitment-gacha, 2026-05-15）
- 招募券起始 10 張、每日 +1、上限 99；抽卡每累積 25 題答對再送一張 （wire-recruitment-gacha / add-quiz-economy-redesign, 2026-05-19）
- 事件與急診照會只在答題或換頁時用機率觸發（事件 5%、急診 3.5%），唸書中不觸發，兩次之間冷卻約 3 分鐘 （rewire-hospital-events-to-non-reading-trigger, 2026-05-26）
- 急診照會答錯不扣熟練度，答對獎勵 1.8 倍，設定裡可關閉 （add-er-consultation-feature, 2026-05-19）
- 「退休」按鈕顯示為 AAD、滑過顯示全稱「自願離院（退休）」，確認視窗仍寫「退休」 （rename-retire-to-aad, 2026-05-19）
- 二階醫師預設名依階級區分，沿用 owner 指定的 5 個字串（大P、主任、Senior V、Young V、R） （2026-05-19-differentiate-default-name-by-tier, 2026-05-19）
- 玩家可以替醫師改名，也可還原預設名；預設名依稀有度有不同頭銜 （add-doctor-rename / differentiate-default-name-by-tier, 2026-05-19）
- 錯題清單以「最近一次作答結果」為準，答對就自動移出，和手動收藏分成兩個分頁 （add-wrong-answer-list-medexam2, 2026-05-19）
- 連續簽到門檻為「5 分鐘唸書或 5 題」，斷簽只給輕提示不羞辱，加成最高 +50% （add-daily-streak, 2026-05-15）（待確認）
- 模擬考為練習模式，沒有倒數壓力，詳解全展開，交卷後錯題不自動進複習 （2026-05-15-add-mock-exam-mode, 2026-05-15）
- 帶圖題目缺圖時保留題目並顯示替代說明，圖片是靠兩輪深度稽核補到 394 題 （add-medexam2-question-images, 2026-05-18）
- 二階獨立後網址仍維持 med-study-rpg.com/2nd/，既有雲端存檔與登入不受影響 （2026-06-03-split-medexam2-standalone, 2026-06-03）

## 成就與排行榜
- 成就採 4 級獎牌（鑽石／金／銀／銅），鑽石要「量加質」複合條件，不是全成就才解 （add-achievement-system, 2026-05-24）
- 14 科精通必須做完該科 100% 題目才解金級，不降到 80% （add-achievement-system, 2026-05-24）
- 排行榜完全信任玩家上傳、不做防作弊；可隨時退出，刪帳號即真刪資料 （add-hospital-leaderboard, 2026-05-22）
- 排行榜暱稱 2–12 字、不分大小寫不可重複，榜單固定顯示前 100 名 （add-hospital-leaderboard, 2026-05-22）
- 排行榜只有答對數、聲望、醫師數、唸書時間等公開欄位，答對數算重複作答；使用者 ID 以雜湊保護 （fix-hospital-leaderboard-correct-source / hash-leaderboard-user-ids, 2026-09-24）
- 排行榜公開欄位清單固定為既定的快照欄位，不含 Strong Synapse 數 （2026-09-24-neurons-leaderboard-snapshot-fields, 2026-09-24）
- 神經元版排行榜有自己獨立的暱稱空間，不和二階共用 （add-neurons-leaderboard, 2026-05-25）
- 留言板（shoutout）卡片只含頭像、排行榜暱稱和一句 40 字內留言；命中髒話或個資直接拒絕、不遮罩；每人每小時限 6 次 （add-neurons-shoutout-board, 2026-06-09）
- 自訂的神經元個體暱稱不會上留言板，只在自己的收藏裡顯示 （add-neurons-shoutout-board, 2026-06-09）

## 神經元版：收集與抽卡
- 每科第一次作答（對錯都算）就送一隻保底最高稀有度的神經元，並當該科代表 （add-neurons-first-pull-path-rep, 2026-06-07）
- 每科抽卡改成「先抽稀有度、再抽該稀有度內的款式」的金字塔，重複抽到會變成複本 （rework-neurons-variant-pyramid / rework-neurons-collection-gacha, 2026-06-02）
- 收藏頁只顯示已收集的，不顯示總數與完成度，抽卡永不因集滿而停用 （rework-neurons-open-collection, 2026-06-02）
- 迷宮節點是唯一的抽卡入口，能量依分支累積、到節點才消耗，不能隨時手動抽 （promote-maze-to-home, 2026-06-03）
- 迷宮成為首頁主視覺，取代原本的連結樹 （promote-maze-to-home, 2026-06-03）
- 靈感卡（DMN）每日上限 5 抽、集滿 20 張後淡出；獎勵改綁出征清錯題 （add-neurons-dmn-fate-card / add-neurons-expedition-rewards, 2026-06-04）
- DMN 消耗品可重複抽到；裝備每件只能擁有一次，抽中機率固定 5%，不加保底 （2026-06-30-make-neurons-dmn-consumables-repeatable, 2026-06-30）
- 出征抽卡門檻用「清掉目前錯題的 25%、50%」並設上下限，每天最多 2 抽 （2026-06-04-add-neurons-expedition-rewards, 2026-06-03）
- 加速道具進背包由玩家手動啟動，永久夥伴只當跟隨小精靈、不穿在角色身上；移除會鼓勵偷懶的 streak-shield （add-neurons-acceleration-system, 2026-06-04）
- 模考獎勵保留靈感卡並共用每日上限，模考與出征分成主次兩種模式 （split-neurons-expedition-exam-modes, 2026-06-08）
- 神經元模擬考模式正名為「模考」，每冊一份 100 題 （2026-06-08-split-neurons-expedition-exam-modes, 2026-06-08）
- 突觸連線由「出征結算」產生，每日修復 ≥5 題才算有效；連線 7 天沒共同修復降一級，不會消失 （rework-neurons-connectome-expedition-driven, 2026-06-08）
- 勿用「進度完成 116/116」之類分母做激勵，改顯示今日出征、連續天數與本週 X/7 （rework-neurons-connectome-expedition-driven, 2026-06-08）

## 每日處方與學習節奏
- 每日處方固定兩行（錯題＋盲區）、總量上限 12 題、只有一個主按鈕 （add-neurons-daily-prescription, 2026-07-04）
- 每日處方箋分四階（基礎、追加固化、形成連結、深度出征），每天能量獎勵合計最多 70 （2026-07-07-add-neurons-prescription-tiers-and-sync, 2026-07-07）
- 完成處方的獎勵是養成收藏神經元 NG-0717（累計完成 1/3/6/10 天進化），漏一天不扣分、不倒退、不顯示「漏了」 （add-neurons-daily-prescription, 2026-07-04）
- 處方首版「少寫題」只指未作答題，不含半熟題 （add-neurons-daily-prescription, 2026-07-04）
- 弱點壓力顯示在科目卡片上，不去染迷宮畫面 （add-neurons-weakness-radar-and-error-repair, 2026-07-07）
- 答題後才顯示考點標籤，答題前不顯示以免劇透 （add-neurons-concept-labels-in-quiz, 2026-07-06）
- 每次作答都會排進間隔複習，題目模式只決定選題，不決定要不要排程 （2026-06-04-add-neurons-quiz-mode-chips-and-srs, 2026-06-04）
- 單科考前救急以「每分鐘邊際得分」為目標，卡關過久會強制重讀 30 秒再測；救急資料同步到雲端 （add-neurons-single-subject-rescue / add-neurons-rescue-r2-sync, 2026-07-08）
- 救急入口與一鍵特訓分開，救急計畫放進考前總覽頁 （add-neurons-exam-prep-hub, 2026-07-12）

## 考前押題與講義
- 押題只顯示原始次數與分級，禁用命中率百分比與「保證／必中／今年一定考」等字眼，必附統計版本戳 （add-neurons-cram-tab, 2026-07-06）
- 考前猜題內容與 A4 PDF 完全公開、免登入 （add-neurons-cram-tab, 2026-07-06）
- 押題與遊戲壓力機制脫鉤，不鎖經驗值或抽卡 （add-neurons-cram-tab, 2026-07-06）
- 講義內容先由題庫 100% 對照，再經 Codex 對抗審與使用者逐章核可才定稿 （add-neurons-anatomy-handout, 2026-07-10）
- 講義依各科分區（如胚胎學 4 區）由使用者確認切法，各科以 per-subject 單元對應題目 （add-neurons-embryology-handout / handout-unit-correspondence, 2026-07-12）
- 講義重點字卡的遮罩若讓句子自己洩漏答案，改用「提示」遮罩；使用者 2026-09-30 選定 （add-neurons-handout-cloze-corpus, 2026-10-01）
- 講義科目順序依考卷順序排列 （reorder-handout-subjects-by-exam-paper, 2026-07-12）

## 題庫與詳解內容
- 玩家自備 PDF，不內建、不提供下載，避免散布受版權資料 （add-neurons-local-pdf-provenance, 2026-06-26）
- 原始詳解 PDF 的入口按鈕放在詳解摺疊區之外、之上，不必展開就能點 （2026-06-26-add-neurons-local-pdf-provenance, 2026-06-26）
- 桌面 App（Tauri）後來整個移除，不再做桌面版 （remove-neurons-tauri-shell, 2026-07-13）
- 缺詳解的 115 年題目用 AI 產生並明確標記來源與查證狀態 （expand-neurons-corpus-104-105-115, 2026-06-03）
- 詳解中的圖表由使用者親手裁切、代理只協助；加圖時文字也必須整理乾淨 （add-neurons-explanation-tables-image-tail, 2026-06-25）
- 詳解中的表格改存結構化區塊並渲染成真表格，不再用文字硬接 （2026-06-25-add-neurons-explanation-tables, 2026-06-25）
- 「簡解」用固定格式（簡解標籤加分隔線）顯示，由使用者定版 （restore-neurons-jianjie-key, 2026-06-25）
- 每個選項的白話解釋由 Claude Haiku 產生，經自動檢查加抽樣審查，不合格不上線 （add-neurons-simplified-explanations, 2026-06-28）
- 題目年份篩選與錯題分頁，跨裝置同步使用同一份設定 （add-neurons-quiz-year-filter, 2026-06-01）

## 帳號、同步與資料安全
- 重設只清神經元版存檔，同帳號的二階存檔不動 （add-neurons-account-reset, 2026-06-11）
- 重置後要有跨裝置傳播標記，避免舊裝置把已清除的資料推回來復活 （2026-06-11-add-neurons-account-reset, 2026-06-11）
- 換帳號登入時先跳確認，確認後清空本機、接受未同步的變更遺失 （fix-neurons-account-switch-guard, 2026-06-11）
- 衝突時由使用者自己選要保留哪一份，不自動覆蓋 （fix-sync-sign-in-lifecycle, 2026-05-19）
- 雲端狀態偵測失敗時視為「未知」，若本機有資料就交給使用者選，不自動上傳 （route-sync-gate-reads-to-active-backend, 2026-07-26）
- 急救計畫（rescue）跨裝置同步，以「最後一個使用者動作」為準 （2026-07-08-add-neurons-rescue-r2-sync, 2026-07-08）
- 重設帳號進度前先備份快照，雲端刪除失敗就中止、不動本機 （add-reset-account-progress, 2026-05-19）
- 遊戲存檔結構變更要從舊版資料升級測試，主鍵不可改 （enforce-dexie-upgrade-fixture-rule, 2026-05-27）
- 免費方案下刪除備份排程而非縮小它，以符合 Worker 的 CPU 限制 （fit-sync-worker-under-free-plan-cpu-limit, 2026-09-21）

## 網站、部署與外觀
- 神經元版網址固定為 /neurons/，是主打版本；舊的一階網站與 GitHub Pages 整個退役，不留轉址 （add-neurons-deploy / remove-medexam-tw-and-promote-neurons, 2026-06-03）
- 根目錄保留首頁 hub，移除一階卡片，神經元版與二階並列 （remove-medexam-tw-and-promote-neurons, 2026-06-03）
- 部署只用 Cloudflare Pages，由 GitHub Actions 觸發 （add-neurons-deploy / align-cf-pages-deploy-with-gh-actions, 2026-05-25）
- 新手導覽改成引導式，終點是抽出第一隻神經元 （improve-neurons-onboarding, 2026-06-10）
- 首頁依序放今日出征、模考、遠征三個階段卡片，詳細資訊預設收合 （redesign-neurons-homepage-cta, 2026-06-10）
- 快速複習按鈕收進出征隊列，隊伍編輯只在圖鑑卡上做、首頁只留唯讀入口 （refold-neurons-quick-review-into-expedition / redesign-neurons-homepage-squad-and-maze-focus, 2026-07-07）
- 迷宮美術走可愛、多樣的神經元風格，使用者曾於 2026-06-05 要求整個重做 （redesign-neurons-maze-brain-tileset, 2026-06-06）
- Lofi 電台音檔放雲端（R2），不放進 repo （add-neurons-lofi-radio, 2026-07-03）
- 神經元版電台改播 Lofi像素電台（/lofi/）的 6 台曲庫，曲目清單執行時讀取、整首串流播放；收音機外觀與操作不變（swap-neurons-radio-to-lofi-pixel-radio, 2026-10-20，取代原 8 台本機曲庫）
- 神經元版的 Threads 宣傳文案由使用者手寫，不自動產生 （add-neurons-dmn-fate-card, 2026-05-28）

## 工作流程（使用者選定）
- 精靈圖產生以 Gemini 為主、像素風才用 codex，且產圖後逐張人工驗收 （generate-neurons-sprites / generate-connector-sprites, 2026-05-25）
- 暫緩的雲端登入自建遷移提案已刪除，不再進行（Supabase 登入維持現狀） （retiring-the-cloudflare-auth-migration, 2026-08-02）
- 神經元部署（合併到 main 上線）由 owner 決定時機，動畫包與前一包一起部署 （2026-06-08-polish-neurons-juice-animations, 2026-06-08）
