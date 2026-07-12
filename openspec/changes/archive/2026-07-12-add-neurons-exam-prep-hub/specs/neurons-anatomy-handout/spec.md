## MODIFIED Requirements

### Requirement: 考前講義入口按鈕

Within the 考前中心 hub (per `neurons-exam-prep-hub`), each subject card SHALL carry a per-subject 講義 entry (a 「講義(beta)」 mini entry, dropping the 「考前」 prefix to avoid label soup inside the 考前中心 hub) that opens that subject's handout via subject-scoped deep-link `/cram/handout?subject=…`. The 講義 entry SHALL use a background color visually distinct from the 五分鐘速看 gold accent (an anatomy-green family fill). This replaces the former single 「考前講義(beta)」button in the flat action row (which sat to the LEFT of the「五分鐘速看版」button); the handout scene at route `/cram/handout` is unchanged.

#### Scenario: 每張科目卡帶講義入口
- **WHEN** 使用者在考前中心 hub 看到某科的科目卡
- **THEN** 該卡帶一個「講義(beta)」mini 入口，底色為解剖學綠系（非金色）

#### Scenario: 點擊開啟該科講義場景
- **WHEN** 使用者點擊某科目卡的「講義(beta)」入口
- **THEN** 導向 `/cram/handout?subject=…` 並開啟全螢幕講義場景、落在該科

## REMOVED Requirements

### Requirement: 題庫分頁的考前講義入口

**Reason**: 題庫 group subtab 由 3 收成 2（題庫 + 考前中心，per `neurons-exam-prep-hub` 與 `neurons-cram-tab` 的 subtab MODIFIED）。考前講義不再是獨立的第三個 sub-tab pill —— 移除以消 label soup。

**Migration**: 考前講義的入口改由考前中心 hub 提供：每張科目卡的 講義 mini 入口（subject-scoped `/cram/handout?subject=…`，per 本 change 的「考前講義入口按鈕」MODIFIED）。`/cram/handout` route 本身不變，既有 direct-URL / F5 / 所有 `?subject=`、`?leaf=` deep-link 全數保留、可直接命中。題庫 top-nav tab 仍透過既有 `/cram/` 前綴比對，在 `/cram/handout` 時維持選中。
