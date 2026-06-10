# neurons-variant-collection-view (delta)


## MODIFIED Requirements

### Requirement: A dedicated /collection route SHALL exist with a single navbar entry

The neurons mode SHALL register a `/collection` route rendering the variant dex page, reachable from exactly one navbar `NavLink` — the 圖鑑 group tab (alongside the 腦圖 / 收藏 / 題庫 / 社群 tabs, per `neurons-mode`'s five-tab consolidated navigation). Within the 圖鑑 group the page is the 神經元圖鑑 sub-tab (siblings: DMN / 成就). The page SHALL NOT be embedded inside the connectome homepage.

#### Scenario: Navbar link navigates to the collection page

- **WHEN** the player clicks the 圖鑑 navbar tab
- **THEN** the app SHALL navigate to `/collection`
- **AND** the variant dex page SHALL render under the 神經元圖鑑 sub-tab

#### Scenario: Direct navigation to /collection renders the dex

- **WHEN** the player loads `/collection` directly (fresh navigation or reload)
- **THEN** the variant dex page SHALL render without redirecting away
