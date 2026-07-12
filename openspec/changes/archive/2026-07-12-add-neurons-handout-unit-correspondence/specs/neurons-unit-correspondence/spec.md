## ADDED Requirements

### Requirement: 講義 hdt-topic SHALL 綁定 canonical leafId 作為 leaf 級 sub-anchor

考前講義的細粒度 sub-anchor SHALL 掛在既有 `<h3 class="hdt-topic">` 教學 topic 上，而非重切 region。The handout build SHALL emit, for each teaching topic, a stable `id` and a **multi-value** `data-leaf-ids` attribute — a space-separated list of that topic's canonical leafIds — so that each topic is addressable at leaf granularity. `data-leaf-ids` SHALL be multi-value because topic:leaf is not strictly 1:1 (e.g. 解剖 76 topic / 87 leaf、病理 90 topic / 65 leaf); a single-value attribute SHALL NOT be used (it would silently drop or mis-merge leaves).

Among the topics carrying a given canonical leaf, **exactly one** SHALL be that leaf's **primary** anchor (the scroll target). region SHALL remain unchanged (roll-up 容器); this requirement SHALL NOT re-cut, merge, or renumber any `<section class="hdt-region">`.

#### Scenario: 每個 topic 帶 leaf 級 anchor

- **WHEN** the handout build emits a subject's HTML fragment
- **THEN** every `<h3 class="hdt-topic">` (or its wrapper) SHALL carry a stable `id` and a `data-leaf-ids` attribute listing its canonical leafId(s)
- **AND** a topic covering multiple leaves SHALL list all of them space-separated (multi-value), not a single value

#### Scenario: region 結構不被更動

- **WHEN** this change's build output is compared against the pre-change handout fragments
- **THEN** the set and ids of `<section class="hdt-region">` regions SHALL be unchanged (no re-cut / merge / renumber)

### Requirement: 講義 build SHALL 以 leaf-anchor gate 防止漏綁與錯綁，獨立於 region drift check

The handout build SHALL run a **leaf-anchor gate** that is separate from the existing region-keyed config↔HTML drift check. The gate SHALL **loud-fail the build** when (a) a `data-leaf-ids` token is not a known canonical leaf for that subject (rename / typo drift), or (b) a single leaf is declared **primary** by more than one topic. The gate SHALL additionally **print** each subject's leaf-anchor coverage (anchored primary leaves / total region-bearing leaves) so incomplete coverage is never silent. A region-bearing leaf that has **no** primary topic anchor SHALL NOT fail the build — it SHALL degrade gracefully to region-level resolution (see resolver requirement) and be counted in the printed coverage report. Non-quiz regions (e.g. the overview 攻略地圖) carry no leaves and SHALL be exempt. The gate SHALL NOT modify or weaken the region drift check.

#### Scenario: 未知 leaf token → build fail

- **WHEN** a `data-leaf-ids` token does not match any canonical leaf of that subject
- **THEN** the build SHALL fail loudly, naming the subject, topic, and offending token

#### Scenario: 重複 primary → build fail

- **WHEN** two topics both declare themselves the primary anchor for the same canonical leaf
- **THEN** the build SHALL fail loudly, naming the leaf and the conflicting topics

#### Scenario: 缺 anchor 的 leaf 不 fail、但列入 coverage 報告

- **WHEN** a region-bearing canonical leaf has no primary topic anchor
- **THEN** the build SHALL NOT fail on that leaf
- **AND** the build SHALL print the subject's leaf-anchor coverage (anchored / total) so the gap is visible, not silent

#### Scenario: leaf-anchor gate 獨立於 region drift check

- **WHEN** the leaf-anchor gate runs
- **THEN** it SHALL NOT alter the existing region-keyed config↔HTML drift check outcome (both checks run; either may fail independently)

### Requirement: HandoutPage SHALL 以 (subject, leaf) 兩段 resolver 消費 ?leaf= 並在缺 anchor/region 時安全降級

The handout scene SHALL accept a `?leaf=<leafId>` deep-link query alongside the existing `?subject=` / `?section=` / `#<region-id>`. Resolution SHALL be **two-segment (subject, leaf)** and SHALL NOT use a global `leafId → anchor` map, because `leafId` is not unique across subjects (68 shared). Within the `?subject=`-selected subject, the cascade SHALL be:

1. **Leaf anchor present** — if the subject's DOM contains `[data-leaf-ids~="<leafId>"]`, the scene SHALL scroll to that leaf's **primary** anchor and briefly highlight it (transient class, no persistent state).
2. **No leaf anchor but leaf maps to a region** — the scene SHALL fall back to scrolling to that leaf's region (equivalent to the existing `?section=` behavior).
3. **No leaf anchor and no region** (cross-subject leak / disputed / 送分 leaf) — the scene SHALL surface an inline "暫無對應講義段落" note plus a "開啟該科講義" escape hatch (subject handout top, no anchor). It SHALL NOT scroll to a wrong topic/region, SHALL NOT crash, and SHALL NOT fall back to region 0 / subject 0.

When both `?leaf=` and `?section=` are present, `?leaf=` SHALL take precedence for the landing target. Subject selection SHALL remain resolved synchronously on first render (as for `?section=`). All resolution SHALL be read-only against the loaded handout content; it SHALL write no persistent state.

#### Scenario: leaf 有 anchor 跳 primary anchor

- **WHEN** the scene opens with `?subject=X&leaf=L` and subject X's content has a topic with `data-leaf-ids` containing `L`
- **THEN** the scene SHALL scroll to that leaf's primary topic anchor and briefly highlight it

#### Scenario: leaf 無 anchor 退回 region

- **WHEN** `?subject=X&leaf=L` resolves within subject X to a region but no topic carries `L` as an anchor
- **THEN** the scene SHALL scroll to that leaf's region (region-level fallback), not to a wrong topic

#### Scenario: leaf 無 region 明示 unavailable、不誤跳

- **WHEN** `?subject=X&leaf=L` where `L` maps to no region in subject X (cross-subject leak / 送分 / disputed)
- **THEN** the scene SHALL show an inline "暫無對應講義段落" note plus a "開啟該科講義" escape hatch to subject X's handout top
- **AND** it SHALL NOT scroll to a wrong topic/region, SHALL NOT crash, and SHALL NOT fall back to region 0 / subject 0

#### Scenario: resolver 為 subject-scoped、禁全域 map

- **WHEN** a `leafId` shared across multiple subjects is resolved
- **THEN** resolution SHALL be scoped to the `?subject=`-selected subject only, never a global `leafId → anchor` lookup

### Requirement: 考前猜題押題 item SHALL leaf 級 deep-link 到講義

Each 押題 (push) item on the cram page SHALL expose a "看講義" affordance that deep-links to that item's canonical leaf in the handout, navigating to `/cram/handout?subject=<subjectId>&leaf=<leafId>`. Because 押題 items are already leaf-native (`push[].leafId`, 100% coverage across all 11 subjects), no lookup table SHALL be required. The affordance SHALL be additive and SHALL NOT remove or alter existing cram behavior.

#### Scenario: 押題 → 講義 leaf 級

- **WHEN** the player activates a 押題 item's 看講義 affordance
- **THEN** navigation SHALL go to `/cram/handout?subject=<subjectId>&leaf=<leafId>` using the item's own `subjectId` and `leafId`

### Requirement: 考前猜題速看 block SHALL 科目級（非單元級）deep-link 到講義

Each 速看 (peek) block on the cram page SHALL expose a "開啟本科講義" affordance that deep-links to the **subject** handout, navigating to `/cram/handout?subject=<subjectId>` (no `?leaf=` / `?section=`). 速看 blocks SHALL NOT be bound to a single leaf/region: they are cross-concept discriminator tables (a single block routinely spans multiple leaves), and forcing a single-unit binding would give a false sense of precision and mislead exam prep. The affordance SHALL be additive.

#### Scenario: 速看 → 科目級講義

- **WHEN** the player activates a 速看 block's 開啟本科講義 affordance
- **THEN** navigation SHALL go to `/cram/handout?subject=<subjectId>` (subject top), carrying no `?leaf=` and no `?section=`

#### Scenario: 速看不做單元級綁定

- **WHEN** the cram content and UI are inspected
- **THEN** no 速看 block SHALL carry a persisted single-leaf / single-region binding used to deep-link at unit granularity

### Requirement: 講義 topic SHALL 反向連結到該單元的考前猜題，閉合三向

Each handout teaching topic (leaf anchor) SHALL surface a "本單元猜題" affordance that links to that leaf's 押題 in the cram page, closing the tri-system loop (講義 ↔ 救急 ↔ 猜題). The existing 「測驗本區／本章」 quiz CTA SHALL be preserved unchanged. The affordance SHALL be shown only for topics whose leaf(s) have a corresponding 押題 item; topics with no matching 押題 SHALL render no such affordance (no dead link).

#### Scenario: 講義 topic → 本單元猜題

- **WHEN** a handout topic carries a leaf that has a matching 押題 item in cram
- **THEN** the topic SHALL surface a 本單元猜題 affordance linking to that leaf's 押題 in the cram page

#### Scenario: 無對應押題不顯示死連結

- **WHEN** a handout topic's leaf(s) have no matching 押題 item
- **THEN** no 本單元猜題 affordance SHALL be rendered for that topic

#### Scenario: 既有測驗本區 CTA 保留

- **WHEN** the tri-system links are added
- **THEN** the existing 「測驗本區／本章」 quiz CTA SHALL remain functionally unchanged

### Requirement: 單元交叉對應 SHALL 為純導覽、零新持久狀態

The entire unit-correspondence feature SHALL be pure navigation plus read-side resolution. It SHALL introduce **no new persistent state**: it SHALL NOT bump Dexie `.version()`, SHALL NOT change R2 `SCHEMA_VERSION` (stays 28), SHALL NOT touch `SYNCED_META_KEYS`, and SHALL NOT import or mutate any sync module. Cross-subject leaf leakage (e.g. 藥理 / 公衛 / 生化 war-map leaves that map to no region in their own subject) SHALL be handled by the resolver's unavailable path and SHALL be covered by regression tests.

#### Scenario: 零 sync 足跡

- **WHEN** the unit-correspondence integration is exercised end-to-end
- **THEN** it SHALL NOT bump Dexie `.version()`, change R2 `SCHEMA_VERSION` (stays 28), diff `SYNCED_META_KEYS`, or import / mutate any sync module

#### Scenario: 跨科洩漏 leaf 走 unavailable 且有回歸測試

- **WHEN** a subject's rescue war-map surfaces a leaf that maps to no region in that subject
- **THEN** the resolver SHALL take the unavailable path (inline note + escape hatch), and this case SHALL be covered by a regression test
