## ADDED Requirements

### Requirement: 題庫分頁的考前講義入口

The 題庫 top-nav tab's sub-tab bar SHALL include a 「考前講義」sub-tab as its third entry, after 題庫 (`/bank`) and 考前猜題 (`/cram`), navigating to `/cram/handout`. Activating it SHALL open the existing full-screen handout scene. While the route is `/cram/handout`, the 題庫 top-nav tab SHALL remain the active top-nav tab. This is an additional entry point; the existing 考前講義(beta) button on the `/cram` page is unchanged.

#### Scenario: 題庫分頁列出考前講義為第三個 sub-tab

- **WHEN** 使用者位於題庫分頁列（`/bank` 或 `/cram`）
- **THEN** 分頁列依序顯示 題庫 / 考前猜題 / 考前講義 三個 pill，第三個「考前講義」指向 `/cram/handout`

#### Scenario: 點擊考前講義開啟講義場景且題庫 tab 維持選中

- **WHEN** 使用者點擊「考前講義」sub-tab
- **THEN** 導向 `/cram/handout` 並開啟全螢幕講義場景，且題庫 top-nav tab 仍為選中狀態（透過既有 `/cram/` 前綴比對）
