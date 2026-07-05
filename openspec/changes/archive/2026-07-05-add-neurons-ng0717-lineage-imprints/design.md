## Context

「今日處方箋」（`neurons-daily-prescription`）在完成兩行後養成單一吉祥物 NG-0717（an adult-born dentate granule cell），成熟由 rolling 完成天數驅動（stage 1/3/6/10 + keepsake）。考前 12 天，dogfood 玩家想要「按部就班覆蓋全部 11 科」的踏實感，但現況缺少逐科覆蓋的可見痕跡。

本 change 前，探索過兩個被否決的方向（記錄以免重蹈）：
1. **巡診路線圖**（11 腦區點燈 + 暖光帶）— owner 主動放棄。
2. **11 隻完整各科可解鎖神經元** — Codex 批判性 review 判為 (a) 與既有 `neuron-variant-gacha`（每科 P0–P5 變體、花神經能量抽卡、開放式收藏）重複造輪；(b) 「11 科各一隻」= 內建 `X/11` 分母，考前變壓力條，打穿抗焦慮核心。

採用 Codex 救回的最小版本：NG-0717「分支印記」——附加 layer，逐科完成處方就在吉祥物身上長出該科的樹突芽。

**約束**：抗焦慮鐵律（monotonic、漏日中性、無 streak-break、無分母、無缺口）；零 Dexie/R2/`SYNCED_META_KEYS`；ship in days；神經科學嚴謹（owner 是醫學生）。

## Goals / Non-Goals

**Goals:**
- 給「逐科覆蓋全 11 科」的可見痕跡 + 收藏解鎖動機，收進既有 NG-0717 吉祥物身上。
- 嚴守抗焦慮鐵律：只渲染已長出的芽，絕不出現 `X/11`／空 slot／缺口／完成度。
- 與既有 `neuron-variant-gacha` 語意不撞（時限 sprint keepsake vs 開放式抽卡收藏）。
- 零 schema/sync 改動，build size S。

**Non-Goals:**
- ❌ R2 sync / 跨裝置持久化（未來 migration 才做）。
- ❌ 11 張 bespoke sprite（用 1 底圖 + tint + accent）。
- ❌ 獨立 collection 分頁 / 完整角色卡。
- ❌ 任何分母／完成度 UI。
- ❌ 修補線指定科目印記（只 breadth 線長芽；repair 只推進主角成熟）。
- ❌ 選科演算法的「最久沒點過優先」偏壓（natural spread 先夠用；如需要另開 follow-up）。

## Decisions

### D1 — Imprint 只由「開發新連結」線在 day-complete 時長出（不含修補線）
完成當日兩行後，對 `plan.breadthFamilyId` 那一科長/推進 imprint。理由：breadth 線每天恰指派一科 → 每日至多長一芽 → 天然對應「一天覆蓋一科」的節奏，跨 sprint 累積成「逐科覆蓋」。修補線跨多科、且語意是「弱點收斂」，交給既有 NG-0717 rolling-day 成熟表達，不重複計數。
- **Alternative（否決）**：repair 線固化某科也長芽 → 會讓芽爆長、失去「一天一科」的節奏，且與變體收藏的「玩收藏」感更接近、更易撞車。

### D2 — State 用 write-once per-(subject, date) meta key，stage 純 derived
Key 形狀：`prescription:v1:ng0717:imprint:<subjectId>:<YYYY-MM-DD>` = `'1'`（write-once）。派生：`touches` = 該 subject 前綴的 key 數；`firstUnlockedDate` = min date；`lastTouchedDate` = max date；stage 由 `touches` 派生（absent/sprout≥1/warm≥2/myelinated≥3）。理由：完全對齊既有 service 的 write-once + `countWithPrefix` 慣例（如 `wrong:{date}:{qid}`），純 monotonic、LWW-safe、無 mutable counter（避免 monotonic-MAX resurrection 類問題）。
- **Alternative（否決）**：單一 `imprint:<subjectId>` JSON 帶 mutable `touches` → 需 read-modify-write、非 write-once，與既有慣例不一致。型別 `{ subjectId, firstUnlockedDate, lastTouchedDate, touches }` 仍作為**派生後**的 in-memory 視圖型別，只是不落地成單一 mutable key。

### D3 — 觸發點掛在既有 `recordPrescriptionAnswer` 的 day-complete transition
既有 `recordPrescriptionAnswer` 在雙線達標時 write-once 寫 `completed:{date}` / `reward:{date}`。在同一 transition、同樣 write-once 判斷下，若 `plan.breadthFamilyId != null` 則寫 `ng0717:imprint:<breadthFamilyId>:<date>`。理由：day-complete 已是既有唯一的「完成」判定點，複用它保證 idempotent、與 completion 同步、不新增觸發路徑。

### D4 — 渲染：芽 branching 繞卡內 NG-0717，可展開；只畫已長的芽
`DailyPrescriptionCard` 既有 NG-0717 mascot（56×56）。在其周圍以小 buds orbit/branch 呈現已長 imprint（stage → 亮度/大小/accent）。點 mascot 或一個小 chip 展開「分支細節」（列已長出的科 + stage 文案），仍**不列未長出的科**。理由：守鐵律（不渲染缺口）、維持單卡儀式、不新增分頁。

### D5 — 美術：1 張共用底圖 + per-subject tint + 1–2px accent
共用一張新生 dentate granule cell 底圖（延續 NG-0717 視覺語言），每科換 tint（沿用 theme 既有 per-family 色）+ 1–2 pixel accent（生理電位線 / 微生物小鞭毛點 / 藥理 vesicle 亮點 等）。stage（sprout/warm/myelinated）用亮度/髓鞘層次表達，不需每科每 stage 各一張。理由：ship in days，11 科 × 3 stage bespoke = 33 張不可行；shared base + tint 足以傳達「這是哪一科的新芽」。

### D6 — 神經科學錨定（OE-verified；neurogenesis 當隱喻）
「新學習長出新記憶迴路」的 fact-claim **錨定在無爭議的顆粒細胞成熟過程**（granule-cell maturation：Hodge & Hevner 2011；Rasetto 2024），而非「成人人類海馬神經新生」本身——後者在人類是 **contested**（Sorrells 2018 vs Moreno-Jiménez 2021）。因此文案把 adult neurogenesis 當**情感隱喻**（NG-0717「新生」的故事 hook 自由），mechanism 敘述只主張「重複點火/新學習 → 突觸強化、系統固化」（systems consolidation：Brodt 2023；retrieval=LTP：Chen 2025 PNAS）。此為上次 anxiety-pack session 已 OE-gathered 的證據（OE article `c7bc1909-...`），本 change 不重新查、亦不誤把爭議當定論。

## Risks / Trade-offs

- **[玩家自己數缺口]** 就算不畫未長的科，玩家可能自己意識到「還有科沒長芽」→ 隱性分母。→ Mitigation：文案只從已長的那側說話、buds 有機散佈非等格排列、絕不提「全部科目」；靠 breadth 線自然節奏讓芽穩定累積。
- **[晚長芽讀成「我到現在才碰」]** 越晚長的芽像遲到通知。→ Mitigation：芽的文案禁任何時間參照（無「終於」「還來得及」），只說「新生分支：X」。
- **[與 variant-gacha 觀感混淆]** 玩家可能以為又是一套收藏。→ Mitigation：命名「分支印記」、視覺是繞 mascot 的芽而非角色卡、無抽卡/貨幣入口、無分頁。
- **[local-only 會遺失]** 換裝置/清 IndexedDB → imprints 消失。→ Trade-off：考前 12 天 shipping speed > durability；接受，未來 migration 可補 sync。
- **[美術 accent 太細，bake/縮圖糊掉]** 1–2px accent 在小尺寸可能看不清。→ Mitigation：以 tint（色相）為主要辨識、accent 為輔；小尺寸下容許 accent 退化，不影響「哪一科」的辨識。

## Open Questions

- **芽的排佈**：orbit（繞圈）vs branch（從 mascot 長出樹狀）——先做 orbit（實作最簡），dogfood 後可換 branch。build 時決定，不 block spec。
- **stage 門檻（warm≥2 / myelinated≥3）**：dogfood-tunable，先用此值；telemetry 後微調。
- **展開細節的入口**：點 mascot vs 一個小「分支」chip——build 時取視覺最順者。
