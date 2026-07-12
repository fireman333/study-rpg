## ADDED Requirements

### Requirement: HelpMenu renders all chrome and body emoji as pixel-art

The HelpMenu (說明選單) SHALL render every supported color emoji as a pixel-art sprite through the
`EmojiIcon` component / emoji-icon manifest — across section-header icons, category icons, and inline
body-prose glyphs — and SHALL NOT leave any supported emoji as a native system glyph. Coverage grows
by adding a codepoint PNG under `public/icons/emoji/` plus a manifest row (per the PNG asset coverage
Requirement). Directional and text symbols (arrows, check, cross) are out of scope and remain text
glyphs.

#### Scenario: Section-header icons are pixelated

- **WHEN** the HelpMenu panel renders its accordion sections
- **THEN** every section-header `icon` — including 📄 (原始詳解 PDF) and ♻ (重置帳號) — SHALL render as a loaded pixel-art `<img>` from `public/icons/emoji/`, not a native system glyph

#### Scenario: Inline body-prose emoji are pixelated

- **GIVEN** a HelpMenu section body contains an emoji that has a manifest sprite (e.g. ✨ / 🤔 / ⭐ / 📖 / 🐞 / 📋 / 🧬 / ⚔ / ⏱ / 🗺)
- **WHEN** that section renders
- **THEN** the emoji SHALL be rendered through `<EmojiIcon>` (a pixel-art `<img>`), not left as a raw text literal
