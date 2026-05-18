## Context

二階 hospital mode 既有「退休醫師」按鈕（[TrainingPage.tsx](../../../apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx)，CSS class `.training-retire-btn`）功能上 stable — refund 公式 / 24h grace / P1-anchor exception / confirmation modal 都 archived 在 `hospital-finances` capability spec 線上跑了一個多月。

本 change 純 user-facing label 改名，無行為變動。會做 design.md 是因為 AAD 這個縮寫 inside-joke 對非醫療 contributor 來說不明顯，未來有人接手（學弟妹 / 社群 contributor）可能誤判為 typo 想 revert，需要把 reasoning 落在 spec + design 兩處讓決策可追溯。

## Goals / Non-Goals

**Goals:**

- 在 retire button 上注入醫療文化 inside-joke（AAD = Against Advice Discharge），提升 dogfood owner 的個人感連結
- Hover tooltip + confirm modal 保留全稱「退休 / 自願離院」，**新玩家不會誤點**
- Internal names（CSS class / service / Dexie table / HelpMenu id）全部不動，**code-level identifier 維持語意中性**
- 把 inside-joke 的理由明文寫進 spec，**未來 contributor 不會誤判為 bug**

**Non-Goals:**

- 不做低 revenue nudge UI（Phase B、等 `add-tier-quiz-multiplier` dogfood 一週後再決定）
- 不改 retirement refund 公式 / 24h grace / P1-anchor exception 任何行為
- 不改 HelpMenu accordion / tutorial 提到「退休」的描述文字（保留全稱、不一致 acceptable — 只有 button 走風味化）
- 不改一階 `apps/medexam-tw/`（沒有 retire 機制）

## Decisions

### D1: Button 文字「AAD」+ tooltip 全稱，而非「AAD（退休）」單一字串

**Decision**: Button visible text = 純「AAD」三字、不附中文。Tooltip 走 native HTML `title` attribute 顯示全稱「自願離院（退休）— 退還 {refund} revenue」。

**Why not「AAD（退休）」連寫**:

- 連寫破壞 inside-joke 視覺衝擊（看到純「AAD」按鈕的醫療系玩家瞬間 get 到才是樂趣）
- Button 寬度被中文撐大 → trigger ratio 算不準（既有 CSS `.training-retire-btn` 設計上是窄按鈕）
- Tooltip 機制是 web 標準 affordance，hover 即顯、不需額外 component

**Why not custom tooltip component（Floating UI 之類）**:

- 純 native `title` attribute 一行解決，無 dependency
- 既有專案沒引入 tooltip 庫，為一個 button 引就是 over-engineer
- 行動裝置 hover 沒效 → 但行動裝置玩家點按鈕之前還會看到 confirm modal 全稱（D3），不是 dead-end

### D2: Confirm modal 保留「退休」全稱

**Decision**: 確認 modal 的 title / body / action button 全部繼續用「退休」/「自願離院」/「確認退休」，**不**改成「確認 AAD」。

**Why**: 點下 button 之後最後一道防呆訊息要 unambiguous。如果 modal 也用 AAD，新玩家可能：
- 不確定按下去到底會發生什麼
- 誤以為 AAD 是「招募」「分配」之類其他動作的縮寫
- 醫療系玩家可能想：「真的要『簽 AAD』讓這個醫師走？」如果 modal 也是 AAD，會破壞 modal 該有的 finality 感

Button 是 inside-joke（風味），modal 是 final commit affordance（清晰）。兩者語氣分工。

### D3: Internal names 全部不動

**Decision**: CSS class `.training-retire-btn`、service function `retireDoctor`、Dexie table `retirementLog`、HelpMenu accordion entry `id: 'retire'`、spec 內 "voluntary retirement" 語意名全部維持原樣。

**Why**:

- Code-level identifier 要 grep-friendly。`retire` 是清楚的英文動詞，未來 contributor 看到能秒懂。
- 如果連 service / table / class 都改 AAD，新貢獻者得先學「AAD 在這個 codebase = retirement」才能讀程式
- Inside-joke 的 surface area 越窄越強 — 只在「玩家眼睛看到」的那一處出現才有衝擊感
- Git diff 也更小：~1 行 string 改動 vs. 上百行 rename refactor

### D4: Spec 寫進「Internal naming invariance」明文契約

**Decision**: 在 MODIFIED 的 voluntary retirement requirement 內加一段 "Internal naming invariance" 字句，明文 lock 內部 identifier 不隨 button label 動。

**Why**: 防止未來 contributor 想「為求一致也把 CSS class 改成 `.training-aad-btn`」。把這個 anti-pattern 寫進 spec = future-proof，省下一輪 PR review 解釋 inside-joke 的時間。

### D5: 不引入 AAD migration / feature flag

**Decision**: 直接改 label string，無 feature flag、無 gradual rollout、無 A/B test。

**Why**:

- 純 UI text 變更、零行為風險，灰度上線無價值
- 玩家 dogfood owner 是作者本人，A/B test 樣本 = 1
- Rollback 成本 = 1 行 git revert
- Phase B（低 revenue nudge）才會考慮 telemetry-driven gradual

## Risks / Trade-offs

| Risk / Trade-off | Likelihood | Mitigation |
|---|---|---|
| 新玩家看不懂 AAD = retire，按下去害怕 | 中 | Tooltip 全稱 + confirm modal 全稱兩道防線（D1 + D2） |
| 未來 contributor revert 成「退休醫師」 | 低-中 | Spec 寫明 AAD 是 deliberate（"Internal naming invariance" + scenario 明文 button visible text = 「AAD」） |
| 行動裝置玩家沒 hover、看不到 tooltip | 中 | 點下去仍有 confirm modal 全稱 → 不是 dead-end；但首次使用體驗會有一秒猶豫 |
| 黑色幽默對非醫療系玩家是 dead joke | 高（acceptable） | App 主要受眾是醫療系玩家，這是 deliberate 主場感；非醫療系看不懂也不影響功能 |
| 一階 / 二階兩個 app 風味不一致（一階沒 AAD） | 低 | 一階沒有 retire 機制，不存在「該不該風味化」這個問題 |

整體判斷：所有風險都是 cosmetic、reversible（1 行 revert）、且 dogfood owner 自己用得爽是 first-class objective。
