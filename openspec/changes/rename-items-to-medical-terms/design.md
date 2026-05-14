## Design

### Slot ↔ medical category mapping

固定下列對應，讓抽卡視覺一致（玩家潛意識會學到 slot = 藥理類別關聯）：

| Slot | 醫學 category | 範例 |
|---|---|---|
| `head` | Receptor / target（受體） | NMDA receptor、α1-adrenergic、5-HT2A |
| `body` | Drug class（藥理大類） | β-blocker、SSRI、ACE inhibitor、Statin |
| `weapon` | Specific drug name（單一藥名） | Aspirin、Warfarin、Morphine、Tamoxifen |
| `charm` | Mechanism keyword（機轉） | Cyclooxygenase、P450 inhibition、Channel block |
| `consumable` | Adverse effect / metabolic concept（副作用 / 代謝） | QT prolongation、Cytochrome induction、First-pass effect |

每個 slot 內按 rarity 分配，總分佈須維持原 catalog 的 **N=8 / R=6 / SR=4 / SSR=1 / UR=1**。

### Rarity 對應「醫學重要性」啟發

| Rarity | 對應的「藥理 importance」 | 範例 |
|---|---|---|
| N | 常見入門 drug / 高頻 receptor / 基礎機制 | Acetaminophen、α1 receptor、Phase I metabolism |
| R | 一線臨床藥 / 常考 class | β-blocker、Aspirin、Statin、SSRI |
| SR | 進階 / 特殊 indication / 副作用顯著 | Warfarin、Lithium、Methotrexate、Theophylline |
| SSR | 鑑別診斷關鍵 / 高 yield 經典題 | Digoxin toxicity、Cytochrome P450 inducer 全家、Serotonin syndrome |
| UR | 國考王道 / 一題定生死 / Nobel-level breakthrough | Penicillin、Insulin、Cisplatin、imatinib（targeted therapy 開山） |

UR 的命名語感要「致敬」— 不是「最稀有的藥」而是「最有故事的藥」。flavor 帶歷史 / 文化梗（Stardew RPG vibe，不是教科書條目）。

### Extraction algorithm（subagent 走的步驟）

Subagent 收到的 input：`apps/medexam-tw/public/content/medexam-tw/questions.json`（418 藥理題）。

**Step 1 — Surface candidates**：
- 對每題的 `stem`、`options.*`、`answer`、`explanation` 跑 token frequency
- 抓 ALL CAP letters 串（drug names 慣例大寫）、`-ase` 結尾（enzyme）、`receptor` / `channel` / `pump` / `inhibitor` / `agonist` 結尾片語
- 抽藥名 dictionary 比對：可用內建 medical naming pattern（`-cillin` / `-mab` / `-tinib` / `-statin` / `-pril` / `-sartan` / `-zole` 等 suffix）

**Step 2 — Frequency + question-importance ranking**：
- 出現次數高 = 高頻 = 偏 N/R
- 出現在 `answer` 而非 `stem` 干擾項 = 真正考點 = 偏 R/SR
- 跨年份重複出現 = 經典 = 偏 SR/SSR
- 罕見但高 yield（出現 1–2 次但題目本身很重要） = UR 候選

**Step 3 — Slot 分類**：套上方 slot mapping 表，把候選詞依結構分類

**Step 4 — Propose mapping**：對現有 20 個 item slot，每個 slot 提出 2–3 個候選名，附：
- 來源題號（reproducibility）
- 出現次數
- 建議的 flavor 草稿（Stardew RPG vibe，1–2 句，繁中）

### Flavor 風格規則

**Do**：
- 帶玩家視角的吐槽 / 自嘲（醫學生苦中作樂）
- 用「梗」連結臨床現實（「主治都會考」「考前一定要背」）
- 1 句話，≤ 25 字

**Don't**：
- 教科書定義（這不是 flashcard）
- 過於專業到一般醫學生看不懂
- 賣弄艱深 terminology

範例對比：

| Rarity | item.name | Flavor（好） | Flavor（壞） |
|---|---|---|---|
| N | Acetaminophen | 普拿疼，發燒第一個想到的選項 | 抑制 prostaglandin 合成、半衰期 1–4 小時的解熱止痛劑 |
| R | β-blocker | 心衰、高血壓、表現焦慮的萬靈丹 | 競爭性拮抗 β-adrenergic receptor |
| SR | Warfarin | INR 沒控好就是腦出血 | Vitamin K 拮抗劑，INR target 2-3 |
| UR | Penicillin | 1928 黴菌污染的培養皿，改變人類歷史 | 第一個 β-lactam 抗生素 |

### Attribution

每個 item 多一個 optional field `sourceQuestionIds?: string[]` 紀錄抽自哪幾題（debug + 教育用）。不在 UI 顯示，只在開發者 inspect 用。

### Migration / compatibility

- **IndexedDB schema**: `Item.id` 改名後，舊存檔的 `ItemInstance.itemId` 會 dangling — MVP 階段沒有 deployed user data，**不**寫 migration helper；M2 上架前 freeze item id 後再加 migration
- **本 change 後 item.id 命名規則固定**：`item:<kebab-medical-term>-<rarity>` — 之後新增 item 走同 pattern
- 既有 sprite key (`artKey`)：theme 還沒有真實 sprite assets，先沿用既有 string identifier；M2 真實 sprite 設計時再依新名稱對應

### Decisions

#### 2026-05-14 — 為什麼用 medical 名詞而不用「medical 名詞 + 可愛包裝」（例 "Aspirin 老師的筆記"）

直接用真名比包裝強：
- 玩家潛意識會把 item 名稱 ↔ 藥物 ↔ 考點建立連結（spaced repetition by exposure）
- 包裝後反而稀釋語意（看到「Aspirin 老師的筆記」記得的是 NPC、不是藥）
- Flavor 已經承擔「不要太硬」的角色，名稱本身保持嚴肅 = 反差感
- 唯一例外：UR 級命名可以帶點「致敬感」（例 "Penicillin" 而非 "盤尼西林的曙光"），但仍是真名為主

#### 2026-05-14 — Slot ↔ category 固定 vs 動態

固定。動態映射讓玩家對「拿到一頂帽子代表什麼類型 buff」失去 muscle memory。固定後玩家會逐漸學會「啊頭部裝備永遠是 receptor、武器永遠是具體藥物」— 這本身就是學習。
