# DESIGN.md — study-rpg pixel-medical default theme

> Drop-in design system following the Google Stitch DESIGN.md convention.
> All UI work in `apps/medexam-tw/` (and the default theme `@study-rpg/theme-pixel-medical`) must follow this file.

## Visual Theme

- **GBA-era JRPG aesthetic**: Pokémon Emerald (2004) / Golden Sun / Mother 3 / Stardew Valley UI — 8–16 bit pixel + 暖色調 + 木質邊框
- **Nostalgic / cozy**: not cyberpunk-dark pixel; warm, healing, "at the study desk" feeling
- **可愛但不幼稚**: target audience is adult medical students; avoid kid-mascot art; aim for "adults-playing-retro" like Stardew

## Color Palette (NES-limited, 16-color feel)

CSS variables, used everywhere:

| Token | Hex | Role |
|---|---|---|
| `--bg-cream` | `#f4ecd8` | parchment background |
| `--bg-dark` | `#2d1f1a` | dialogue box bg |
| `--ink` | `#1a1410` | body text |
| `--accent-leaf` | `#6a8c3f` | HP / stamina |
| `--accent-rose` | `#c44d4d` | warning / boss |
| `--accent-gold` | `#d4a04d` | XP / badge |
| `--accent-sky` | `#6a9bc4` | knowledge / MP |
| `--frame-wood-light` | `#8c6d4a` | frame highlight |
| `--frame-wood-dark` | `#5a3f29` | frame shadow |

Rarity:

| Rarity | Token | Hex |
|---|---|---|
| N | `--rarity-n` | `#ffffff` |
| R | `--rarity-r` | `#6a9bc4` |
| SR | `--rarity-sr` | `#a06ac4` |
| SSR | `--rarity-ssr` | `#d4a04d` |
| UR | `--rarity-ur` | `#c44d4d` |

**禁**: CSS gradient（用 dither pattern 代替）、半透明 alpha < 1.0、modern soft pastel

## Typography

- 拉丁字 / 數字 / UI label: `Press Start 2P` (titles) + `VT323` (numbers)
- 中文 UI label: **Cubic 11** (CJK pixel font)
- 中文長文（題幹 / 詳解）: fallback to `Noto Sans TC`（像素 CJK 讀長文累人）
- `font-smoothing: none`; `image-rendering: pixelated`
- font-size 階梯: **8 / 12 / 16 / 24 / 32** (2 的倍數)

## Components

- **Dialogue box**: 木質邊框（9-slice）+ `▼` 閃爍三角形 + typewriter 文字
- **HP / MP / EXP bar**: 硬邊 1px border + 像素塊填充
- **角色卡**: 64×64 sprite 站在木框內
- **按鈕**: 硬邊 2px border + 按下時 1px 位移
- **題目卡片**: parchment 米色底 + 木框邊
- **Boss 戰 UI**: 全螢幕翻頁進場 + 「Wild 藥理學 appeared!」對話框

## Layout

- **Viewport**: 960×540（16:9）frame，外圍 tile 重複
- **Grid 基底**: 16px tile；padding / margin 都是 16 的倍數
- 主畫面: 左 ⅓ 角色卡 + 屬性、右 ⅔ 行動按鈕

## Depth

- ❌ Soft shadow（`box-shadow: 0 4px 12px rgba(0,0,0,.1)` 一律禁）
- ✅ Hard pixel shadow（`box-shadow: 2px 2px 0 #2d1f1a`）
- 立體感靠 dithering pattern

## Do's / Don'ts

**Do**:
- 所有 `<img>` 加 `image-rendering: pixelated`
- 數字 / 屬性點冒泡用整數位移
- 對話框文字逐字打出（30ms/char）
- Hover / press 用 1–2px 整數位移
- chiptune 音效（optional）

**Don't**:
- CSS gradient / radial-gradient
- `border-radius` > 0
- Drop shadow / blur / backdrop-filter
- Modern flat UI 圓潤動畫曲線
- Emoji（要用 16×16 pixel icon）
- 半透明 alpha

## Responsive

- 桌機 ≥ 1024px: 完整 viewport + 邊框背景 tile
- 平板 768–1023px: viewport 縮放保比例（`transform: scale()` integer multiplier）
- 手機 < 768px: viewport 全螢幕（去除外邊框），UI 單欄重排

## Agent Prompt Guide

> All UI work in `study-rpg` must follow this DESIGN.md. Pixel-perfect: use `image-rendering: pixelated`, integer-only px values, no gradients, no border-radius, no soft shadows. Type scale = 8/12/16/24/32. Color palette is locked to the CSS variables above. Hard 1px borders, pixel-shadow offsets, 9-slice frames. Reference Pokémon Emerald / Stardew Valley UI for the vibe.

## Asset sources (CC0 / open)

- Sprites: [OpenGameArt](https://opengameart.org/) CC0、[Kenney.nl](https://kenney.nl/assets)、[Itch.io free pixel](https://itch.io/game-assets/free/tag-pixel-art)
- Fonts: Cubic 11 (CJK)、Press Start 2P、VT323、Pixelify Sans
- SFX: [Bfxr](https://www.bfxr.net/)、[Freesound](https://freesound.org/) CC0
- Editing: [Aseprite](https://www.aseprite.org/) / [Piskel](https://www.piskelapp.com/)
