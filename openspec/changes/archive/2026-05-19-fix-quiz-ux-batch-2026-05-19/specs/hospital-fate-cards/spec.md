## REMOVED Requirements

### Requirement: Fate cards SHALL be unlocked at 醫學中心 tier

**Reason**: 命運卡作為 reputation 溢出 sink 在任何 tier 都成立 — 區域醫院的玩家 reputation 也會溢出（cap 不會隨 tier 縮放）。原本的 tier gate 把這個調節閥鎖在 endgame，反而讓中期玩家少了一條 reputation 出口。Owner 在 dogfood 時也明確表示想讓玩家更早能抽。

**Migration**: 命運卡 UI 在任何 tier 都顯示且可互動，僅 `reputation < cost` 仍會 disabled 按鈕（既有 `insufficient` 邏輯不變）。Pre-existing players 進到 `/fate-cards` 時不再看到鎖定 placeholder。
