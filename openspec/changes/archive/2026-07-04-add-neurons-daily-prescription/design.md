## Context

neurons-tw 的核心 loop 已成熟（錯題出征、family fresh/review、DMN 抽卡、connectome、mastery、streak），但**所有答題入口都要玩家自己決定**「現在該進哪個」。考前最後 13 天（考試 2026-07-17、今天 2026-07-03），這個決策成本本身就是最大的棄坑點；此時 app 的角色應從「催你多讀」轉為「減害」。

本 change 交付一組**每日一開一關**的體驗：
- **今日處方箋（開）** — 純導流 + 每日結構化，每天算出「今天做這兩件小事就好」，一顆按鈕把玩家推進**既有**的錯題出征與 fresh 新題；完成則養成收藏神經元 **NG-0717**。
- **熄燈儀式（關）** — 一顆「今天到此為止」，把 connectome 轉夜景、給結束的許可、把休息 reframe 成睡眠固化，並讓首頁進入低刺激收工態。

**現有 codebase 已驗證可直接複用（無 schema 改動）**：錯題池 `expedition.ts` `buildWrongQuestionPool()`（依 `lastResult==='wrong'`）；未作答題 `quiz-pool.ts` `filterPoolByNewOnly()` + `srs-scheduler.ts` `computeFamilyModeCounts()`；per-family 覆蓋率 `familyMastery {correct,total}`；per-question `attempts`/`correctCount`；每日重置 `connectome.ts` `runDailyResetIfNeeded()`；日期鍵 `todayISO()`；每日 meta 累加器慣例（`conduction:dailyTotal:{date}`）；傳導能量 faucet `lib/maze/economy.ts`（已 daily-capped）。

## Goals / Non-Goals

**Goals:**
- 把「今天讀什麼」的決策外包給 app：每日兩行、總量 ≤12、單一 CTA；同推**訂正錯題**與**開發盲區**。
- 收藏型、情感共鳴的完成獎勵 **NG-0717**（新生神經元逐步成熟），而非又一份 loot。
- **給結束的許可**：熄燈儀式 + 低刺激收工態，緩解「不知道今天何時算讀完」的焦慮。
- **零負面感 / 不到 14 天也成立**：進度只跟「完成天數」掛鉤、只增不減、漏一天中性無懲罰、無達不到的分母、考後不 lockout。
- **零 Dexie schema bump、零 R2 sync 改動、零經濟破壞**。

**Non-Goals:**
- 不新增 quiz mode / 題庫 / DMN 抽卡來源 / 貨幣 / 排行榜軸。
- 不做 readiness meter、不做倒數恐嚇、不做缺口清單、不做「連續 X 天」壓力型 streak。
- MVP 不做半熟題（attempts≤1）、NG-0717 動畫（先靜態 4 階段）、考前物品清單 / 前輩信 / 寄物櫃等其他 anxiety-relief 想法（列 backlog）。
- 不改動 DMN、髓鞘加速系統、connectome 突觸機制的任何既有 spec。

## Decisions

### Decision 1 — 兩行處方（錯題 N + 盲區 M），總量硬上限 12，單一 CTA
- **選擇**：每日固定兩行；N 依錯題池大小自動縮放（0→自動完成 / 1–3→全部 / 4–20→4 / 21–80→5 / >80→6），近 20 題正確率 <50% 時 N 上限降 3、50–65% 降 4；M 與 N 互補使總量 ≤12（N=0→10 / 1–4→8 / 5→7 / 6→6）。UI 只有一顆「開始今日處方」，永遠 route 到下一個未完成項（先錯題後盲區）。
- **理由**：焦慮玩家需要「降低啟動成本」而非「今天變強很多」。小數字 + 自動選擇 = 可完成感；正確率低自動降錯題目標，避免處方變第二場考試。
- **Alternatives**：三行含讀書計時 → 拒絕（重、與 per-subject 閱讀重疊、增加決策）；讓玩家自選題數 → 拒絕（違反「不用決定」）。

### Decision 2 — 「少寫題」MVP = unseen，盲區科用加權分數選一科
- **選擇**：MVP 只把「少寫」定義為 `filterPoolByNewOnly` 的未作答題；每日選一盲區 family：`score = 0.75·(unseen/total) + 0.25·min(1,(outstandingWrong/max(uniqueAttempted,8))·3)`，只選 `unseen>0`、分數最高、同科最多連選 2 天、`date+familyId+localUserId` hash tie-break，CTA 直開該科 `fresh`。
- **理由**：`fresh` 已存在 → build 風險最低；加權把人推向「低覆蓋+有錯題壓力」的科（interleaving/coverage）。
- **Alternatives**：一開始含半熟題（attempts≤1）→ 資料齊備但需新 filter，延第二版（user 已拍板 MVP unseen）。

### Decision 3 — 完成獎勵 = 收藏神經元「NG-0717」（成人新生顆粒細胞），rolling 完成數驅動
- **選擇**（經 Fable 設計辯論 + OE 查證後從「抽象固化迴路」pivot）：完成每日處方 → 養成 **NG-0717**（齒狀迴 adult-born granule cell mascot）。4 階段對應完成 **1/3/6/10** 天（dogfood-tunable）：幹細胞 → 遷移 neuroblast → 佈線未成熟 → 成熟整合（完全體）；**第 10 天完全體**解鎖永久 keepsake，刻印 `2026.07.17`。階段**純從 `completedDayCount` derive**，不存 stage。旁邊可保留一條「已固化 X 天」的 diegetic 讀取層（齒狀迴顆粒細胞層節點），但**不用達不到的分母**。
- **理由**：collection RPG 受眾的驅動力是 **ownership instinct > completion instinct**；一隻專屬會進化的 creature 情感/收集/稀有感都勝過抽象進度條（Fable 3:1 判定）。「從種子長成完整神經元」把死行軍 reframe 成「我在成長」，命中考前焦慮；序號 NG-0717（neurogenesis + 0717）＝ class-of-2026 紀念。
- **神經學嚴謹（重要）**：OE 查證顯示——**顆粒細胞 4 階段成熟序列**（齧齒類）與**學習/運動促進新生神經元存活整合**皆為**無爭議事實**（美術與隱喻站得住）；但**成人「人類」海馬是否持續神經新生仍在爭議**（Sorrells 2018 vs Moreno-Jiménez 2021）。故 NG-0717 當**情感 mascot 隱喻**，UI 文案主語放在無爭議部分（成熟歷程、學習促存活、系統固化），**不宣稱「你人腦每天新生一顆」**。
- **Alternatives**：抽象固化迴路（原案）→ Fable 判為「披皮進度條」，情感弱；髓鞘/oligodendrocyte/DMN/Na-K/mitochondria → 皆已被既有系統佔用，不可用於獎勵。

### Decision 4 — 零 schema：全部放 local-only `meta` key（含防灌水 snapshot）
- **選擇**：資料模型全走 `meta`（見下）。`plan` 首次生成即 freeze；進度與每日完成用 write-once key（只從無→true，永不刪）→ `completedDayCount` 天生 monotonic；`reward` idempotent。**皆為 local-only，不加進 `SYNCED_META_KEYS`**。
- **理由**：write-once key + 純 derived → LWW 天生安全、無 spendable/bidirectional counter → 徹底避開 monotonic-MAX 復活坑（[[neurons-dmn-draw-resurrection-fix]] 教訓）。plan snapshot `wrongEligibleQuestionIds` 讓「故意先答錯再訂正」無法灌進度。
- **Alternatives**：新 Dexie table / 加欄位 → 拒絕（高風險 + 需 upgrade fixture）；同步到雲端 → 拒絕（無跨裝置需求 + merge 複雜度）。

### Decision 5 — Pacing 脫鉤日曆、零負面感、考後不 lockout
- **選擇**：NG-0717 成熟只看 **rolling `completedDayCount`**，不看日曆；漏一天 = 中性（不扣、不倒退、不標紅、不顯示「漏了 X」）、不要求連續；完全體門檻 10（<13 天窗口內留餘裕，可漏數天照樣考前養成）；cumulative 顯示「已固化 X 天」無分母；「距考試還有 N 天」只當氛圍 chrome、不 gate；考後不 lockout，倒數翻「考試結束 · 繼續固化」。
- **理由**：直接解 user 兩個顧慮——「不到 14 天」（門檻 10 + 不綁日曆 + 不 lockout）與「不想有漏刷負面感」（monotonic + 中性漏日 + 無分母）。也照顧遲來者（同規則、零懲罰）。
- **Alternatives**：硬綁 7/17 的 14 格倒數 → 罰遲來者、漏日留洞、考後即死，拒絕。

### Decision 6 — 熄燈儀式（關）+ 低刺激收工態
- **選擇**：首頁常駐「今天到此為止」，按下 → connectome 轉暖色夜景、今天碰過的科各一下微光、rest/睡眠固化 reframe 文案；任何時間可按、每日一次、local-only key、午夜清除；之後首頁進入收工態（安靜/隱藏 push CTA），但**非 hard lock**（可「還是想再讀一下」還原）。純質性（不顯示題數/分鐘/分數/倒數/pass-fail）。
- **理由**：考前焦慮最實際的形狀是「不知道今天何時算讀完」；一顆按鈕給結束的許可，與處方箋（開）成「一開一關」。睡眠固化文案有 OE 錨。
- **Alternatives**：自動偵測時間逼人收工 → 拒絕（恐嚇/剝奪 agency）；hard lock 到隔天 → 拒絕（不誠實、剝奪想讀的人）。

**Meta data model**（`prescription:v1:` 命名空間，date = `todayISO()`；全 local-only）：
```
prescription:v1:plan:{date}     = { date, createdAt, seed, wrongTarget, breadthTarget,
                                     breadthFamilyId, breadthFamilyLabel,
                                     wrongEligibleQuestionIds[], breadthEligibleQuestionIds[] }  // freeze
prescription:v1:wrong:{date}:{questionId}    = "1"   // write-once
prescription:v1:breadth:{date}:{questionId}  = "1"   // write-once
prescription:v1:completed:{date}             = { completedAt }  // write-once; 掃此類 key 數 = completedDayCount
prescription:v1:reward:{date}                = { claimedAt, energyGranted }  // idempotent
prescription:v1:lightsOutDate:{date}         = { at }           // 熄燈當日態，午夜失效
```
NG-0717 stage = derive(`completedDayCount`)：≥10→4 / ≥6→3 / ≥3→2 / ≥1→1 / else 0。keepsake 解鎖 = `completedDayCount ≥ 10`。

## Risks / Trade-offs

- **[獎勵隱喻撞車]** 髓鞘 / oligodendrocyte / DMN / Na-K / mitochondria 皆已佔用 → **Mitigation**：獎勵改用未使用的成人神經新生（NG-0717）；spec scenario 不得引用髓鞘。
- **[成人人類神經新生有爭議]** → **Mitigation**：當情感 mascot 隱喻；UI 文案只斷言無爭議事實（成熟歷程 / 學習促存活 / 系統固化），不宣稱人腦每日新生；美術畫的是無爭議的成熟序列。
- **[錯題太難卡住]** → N 很小；近期正確率低自動降到 3。
- **[逃避大題量]** → 總量硬 cap 12；單一 CTA 只帶下一步。
- **[刷同題灌進度]** → 每 questionId 每日一次；錯題只計 plan snapshot。
- **[盲區永遠同科]** → 同科最多連選 2 天。
- **[經濟污染]** → 不發 draw / currency；能量只走既有 daily cap。
- **[熄燈儀式在零活動日變羞辱]** → 質性夜景、永不顯示題數/分鐘；一題沒碰也能按，文案「休息也是機制的一部分」。
- **[熄燈睡眠文案過度宣稱]** → 只講一般機制、不保證個人結果；對應 design.md anchor 表。
- **[跨裝置弧線/熄燈態不同步]** → 接受（local-only cosmetic 進度，與既有 once-per-day ritual flag 取捨一致）。

## Migration Plan

- 純加法、無 migration：不改 Dexie `.version()`、不改 R2 `SCHEMA_VERSION`、不改 `SYNCED_META_KEYS`、不改 D1。
- Rollback = 移除 `DailyPrescriptionCard` + 熄燈控制 + service/hook；殘留 `prescription:v1:*` local key 無害、隨每日 key 閒置。
- 部署走既有 CF Pages pipeline；新增 NG-0717 sprite 走既有 `sprites/` + `import.meta.glob`（已生成 concept，apply 時切成 production 單張）。

## Open Questions

- NG-0717 最終美術：原始 concept（cream 底已乾淨）vs v2a 柔和版 —— apply 美術收尾時定案（皆已生成、皆乾淨）。
- 完全體 keepsake 要否進 `cosmetic-system` catalog（predicate unlock）或純 derived 顯示 —— MVP 傾向純 derived（零 schema），要進宿舍再開 follow-up。
- 熄燈收工態的 CTA 隱藏範圍（只隱處方 CTA vs 連 quiz 入口）—— apply 時以最小驚訝為準，保留「還是想再讀一下」還原。

## Neuroscience anchors（OpenEvidence, PubMed-anchored）

| 機制對應 | 神經學根據 | Key citation(s) |
|---|---|---|
| 訂正錯題 → prediction error / 記憶再固化 reconsolidation（針對錯題特別有效） | 更正錯誤產生 prediction error → 記憶暫時可塑而被更新加固 | Sinclair & Barense 2019, *Trends Neurosci* 42(10):727–739; Fernández 2016, *Neurosci Biobehav Rev* 68:423–441 |
| retrieval practice 本身 = Hebbian LTP「fire together, wire together」 | testing effect 走 prediction-error / dopaminergic 強化，與 LTP 一致 | Chen 2025, *PNAS* 122(32):e2506530122; Marin-Garcia 2021, *Front Hum Neurosci* 15:584560 |
| 開發盲區（少寫題）→ 間隔效應 / behavioral tagging | 少複習題需更費力提取 → 長期記得更牢 | Feng 2019, *J Neurosci* 39(27):5351–5360; Tintorelli 2020, *Sci Rep* 10:98 |
| 每日小量 + rolling 成熟 → 分散練習 / 系統固化 | retention 取決於題目出現在幾個不同「日子」；睡眠 SWS replay 做系統固化 | Walsh 2023, *Mem Cognit* 51(2):455–472; Brodt 2023, *Neuron* 111(7):1050–1075; Klinzing 2019, *Nat Neurosci* 22(10):1598–1610 |
| **NG-0717：顆粒細胞成熟 4 階段（美術依據）** | 齧齒類 adult-born granule cell 幹細胞→neuroblast→未成熟→整合成熟序列**確立無爭議**（~7–8 週） | Hodge & Hevner 2011, *Dev Neurobiol* 71(8):680–689; Rasetto 2024, *Sci Adv* 10(29):eadp6039 |
| **NG-0717：學習/運動促進新生神經元存活整合（隱喻依據）** | 齧齒類**確立**（跑步↑增生+存活；海馬依賴學習↑存活；BDNF） | Ávila-Gámiz 2023, *Physiol Behav* 266:114184 |
| **NG-0717：成人「人類」神經新生 = 有爭議（文案避雷）** | Sorrells = 成人幾乎測不到 vs Moreno-Jiménez = 持續；多為方法差異 | Sorrells 2018, *Nature* 555:377–381; Moreno-Jiménez 2021, *J Neurosci* 41(12):2541–2553 |
| **熄燈儀式：睡眠 / 系統固化（收工文案依據）** | 海馬→皮質時間依賴重組為**確立框架**（睡眠期 replay/engram 再活化） | Brodt 2023, *Neuron* 111(7):1050–1075; Takehara-Nishiuchi 2021, *Eur J Neurosci* 54(8):6850–6863 |

（避開已佔用隱喻：髓鞘 speed lane / 突觸強化 connectome / DMN fate cards / Na⁺-K⁺ pump / mitochondria。）
