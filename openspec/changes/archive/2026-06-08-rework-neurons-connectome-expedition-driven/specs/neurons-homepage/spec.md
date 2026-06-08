## ADDED Requirements

### Requirement: Homepage SHALL surface connectome status as narrative indicators, not a collection denominator

The homepage SHALL present the connectome (Hebbian 連線) status as **narrative indicators**, not as an `X/N` collection progress bar. The displayed signals SHALL be drawn from connectome state + the expedition streak:

- 今日出征：完成 / 未完成（today's effective expedition completion)
- 連續出征：N 天（`expeditionStreak`)
- 本週出征：X/7（rolling weekly effective-completion days, per `connectome-collection`)
- 穩定連線：count of strong-state synapses **excluding legacy/不計入的早期連線** (per `connectome-collection` legacy-synapse requirement)
- 最強 pair：the most-recently / most-co-repaired validated pair (by `lastCoFireDate` + accumulated co-repair)
- 今日連線額外獲得：X 能量（total synaptic conduction energy received today across all wires, per `connectome-collection`)

The homepage SHALL NOT display a `116/116`-style connectome completion denominator (this would create a second collection meter competing with the 二週目 location-variant collection). The connectome overlay on the maze SHALL default to visible as the homepage's prominent layer (per `neurons-brain-maze`).

#### Scenario: Connectome status shows narrative indicators

- **WHEN** the homepage renders connectome status
- **THEN** it SHALL show 今日出征 完成/未完成、連續出征 N 天、本週 X/7、穩定連線數（不含早期連線）、最強 pair、今日連線額外獲得 X 能量
- **AND** it SHALL NOT show a `116/116` (or any fixed-denominator) connectome collection bar

#### Scenario: Homepage with no synapses shows an honest empty state

- **GIVEN** the player has formed no synapses yet
- **WHEN** the homepage renders connectome status
- **THEN** stable-link count SHALL read 0 and 最強 pair SHALL be absent
- **AND** the UI SHALL NOT fabricate any connectome line

### Requirement: Homepage SHALL offer a shareable Hebbian-connection card

The homepage SHALL let the player generate a shareable card summarizing their connectome learning trace, reusing the existing share-card infrastructure (`ShareCardModal` / `character-card`). The card content SHALL include narrative, non-numeric-bonus facts only: 今日修復 X 題 / 連續出征 N 天 / 今日連起 A–B / 穩定連線 Y 條. The card SHALL NOT imply any gameplay bonus from the connectome.

#### Scenario: Player generates a Hebbian-connection share card

- **WHEN** the player opens the share-card flow from the homepage
- **THEN** a card SHALL render with 今日修復題數 / 連續出征天數 / 今日新連起的 pair / 穩定連線數
- **AND** the card SHALL reuse the existing ShareCardModal / character-card rendering path

### Requirement: The UI SHALL make the wiring benefit (synaptic conduction) legible

To communicate the benefit of wiring (not just that conduction happened), the UI SHALL provide a **settlement conduction ledger**: at expedition settlement, a short ledger SHALL list each conduction that flowed (`<source> → <target> +<amount> 能量`) plus a total (`今日連線額外獲得 +X 能量`), alongside the day's repairs, whether a wire formed/strengthened, and (when no cross-subject wiring occurred) an honest "今日已修復，尚未形成跨科連線" line. This is presentation of the `connectome-collection` conduction mechanic; the UI SHALL NOT itself grant or compute conduction energy.

(Deferred to follow-up `polish-neurons-connectome-visual`: per-wire hover tooltip + about-to-wire ghost line in the picker.)

#### Scenario: Settlement shows the conduction ledger

- **GIVEN** today's expedition settlement conducted +12 from 藥理 to 解剖 and +5 from 藥理 to 生化
- **WHEN** the settlement screen renders
- **THEN** it SHALL list `藥理 → 解剖 +12`、`藥理 → 生化 +5` and `今日連線額外獲得 +17 能量`
