# §1.5 Owner Sign-off — concept vocabulary（add-neurons-concept-tags）

## 骨架（skeleton）

| 科目 | 題數 | leaves | sat≥18/23（估） | 章節（含 cold） |
|---|---|---|---|---|
| 生物化學 | 608 | 71 | 2 | 4 |
| 解剖學 | 700 | 87 | 0 | 4 |
| 胚胎學 | 108 | 12 | 0 | 1 |
| 組織學 | 225 | 25 | 0 | 1 |
| 生理學 | 612 | 71 | 6 | 10 |
| 微生物學 | 406 | 48 | 1 | 3 |
| 免疫學 | 264 | 30 | 0 | 14 |
| 寄生蟲學 | 166 | 21 | 0 | 5 |
| 藥理學 | 577 | 62 | **15** | 10 |
| 病理學 | 574 | 60 | 1 | 10 |
| 公共衛生學 | 360 | 42 | 0 | 7 |
| **合計** | 4600 | **529** | — | 69 |

- 封閉集乾淨（validator R1–R9 全過、typecheck clean、`verify:concept-vocab` 綠）。
- 全域密度落在每科題數÷8–12 目標帶；**無任一科整體過粗/過細**。
- 骨架 = 官方考選部命題大綱章節（`blueprint-coarse.json`）；leaf = 語料實際被考概念、教科書標準術語命名。

## Agent panel 結論

| Reviewer | verdict | blocking | 重點 |
|---|---|---|---|
| **Codex**（結構/封閉一致性） | needs-rework | 3 | 封閉集無違規；問題在合法章節內的語意封閉性、同科重疊、非標準命名 |
| **Fable**（粒度/pedagogy/押題） | ship-with-minor-fixes | 3 | 結構健全，問題是「科內分佈失衡」非全域粒度；皆外科手術式拆桶/改名，非重寫 |

兩位一致：**結構健全、可上線，但需針對性拆桶/改名**才能讓押題排序不失真。

## 已套用（3 個明確修正，我已改 + regenerate + 驗證綠）

1. **病理/wound-healing-fibrosis**：移除誤植的抑癌基因同義詞（RB / p53 / p16）→ 讓「p53」搜尋正確落到 carcinogenesis（該 leaf 實際考點是肉芽組織/纖維化/再生，非癌症）。
2. **寄生蟲/mite-borne-disease**：拆成 `scrub-typhus-chigger-mite`（恙蟲病，病媒感染，4題）+ `dust-mite-allergy`（塵蟎過敏，非感染，2題），兩者仍在 arthropod-vectors 章。
3. **微生物/candida-species → opportunistic-yeast-like-fungi**：改名，並在同義詞顯性化 Cryptococcus / Pneumocystis（原名誤導「只談念珠菌」）。

## 需你拍板（§1.5 決策）

### 決策 1（樞紐）：§2 標註前，要多積極拆「飽和/複合桶」？

兩位 panel 的頭號 ownerDecision。三類問題桶：

- **A. 病理「重現度失真」複合桶（4 個）** — 高頻疾病藏在低頻名下，兩位都點名：
  `parathyroid-disease`（副甲狀腺＋**糖尿病病理**）、`metabolic-bone-disease`（骨病＋**眼科病理**）、`hodgkin-lymphoma`（HL＋**myeloma/CLL**）、`colorectal-neoplasia-polyposis`（大腸癌＋口腔唾液腺）。→ **建議一律拆**（這是名稱誤導＋押題失真，不只是粒度）。
- **B. 藥理飽和平台（15 個 leaf ≥18/23）** — `antimuscarinic-drugs`(30Q,23/23)、`nsaids`(33Q,23/23)、`beta-lactam`、`adrenergic-agonists`、`antiarrhythmic` 等幾乎全在 23/23 → 押題頂端變無鑑別平台。拆成臨床用途/次類可恢復銳度，但要 re-mine 藥理。
- **C. 生化/微生物飽和大桶** — `vitamin-function-deficiency-syndromes`(26Q)、`protein-higher-order-structure`(21Q)、`recombinant-dna`(20Q)、微生物 `vector-borne-atypical-bacteria`(含螺旋體/梅毒)。

### 決策 2：其餘 ~40 條 ambiguityShortlist（miner 自陳）+ panel P3/P4 建議

多為 sizing-driven bottomUp 合併、跨科同名 leaf（membrane-transport/apoptosis 加科別後綴）、生理 enzyme-kinetics 是否 re-home（我的看法：那 2 題是生理考卷上的酵素動力學題，**不能移**到生化，建議保留為低頻生理概念）。這些不阻擋、可 §2 後 dogfood 再調。

### 附註（Fable 提的資料缺口）
目前「飽和/失真」判斷是用 miner 自估的 estTestedSittings（非權威）。**真正權威的 per-leaf × sitting 直方圖要 §2 標註完才有**。故「決策 1 的拆桶」有兩種時機：現在憑估計先拆，或 §2 標完用真數據再拆（更準但多一輪）。
