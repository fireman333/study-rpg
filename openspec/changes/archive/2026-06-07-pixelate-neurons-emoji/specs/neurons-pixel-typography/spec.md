## REMOVED Requirements

### Requirement: Emoji SHALL remain native system emoji (out of scope for pixelization)

**Reason**: Superseded — the deferred emoji-pixelization follow-up named in this requirement is now implemented (this change). Chrome emoji become pixel icons; the new requirement below governs emoji rendering.

**Migration**: Replaced by the ADDED requirement "Chrome emoji SHALL render as pixel icons via an EmojiIcon component with graceful native fallback". No data or API migration — pure presentation. Emoji with no pixel-art asset (and emoji inside legible exam/long-form surfaces) continue to render as native system glyphs, so nothing regresses to tofu.

## ADDED Requirements

### Requirement: Chrome emoji SHALL render as pixel icons via an EmojiIcon component with graceful native fallback

Inline emoji on the app's warm "RPG chrome" surfaces SHALL be rendered through an `EmojiIcon` React component that substitutes a GBA-style pixel-art PNG (`apps/neurons-tw/public/icons/emoji/<lowercase-hex-codepoint>.png`, 64×64) for any emoji character mapped in the app's emoji-icon manifest (`apps/neurons-tw/src/lib/emoji-icons.ts`), so chrome emoji visually match the Cubic 11 pixel chrome. For an emoji character NOT present in the manifest, `EmojiIcon` SHALL fall back to rendering the original character in an inline `<span>` (the OS emoji font keeps working — no broken or missing-glyph "tofu" output). The manifest lookup SHALL normalize the U+FE0F variation selector before matching, so a variation-selector-bearing input (e.g. `⚔️`) resolves to the same asset as its bare codepoint. The pixel `<img>` SHALL be rendered with `image-rendering: pixelated`, an explicit width/height equal to the requested `size`, and `draggable={false}`. The resolved asset URL SHALL be base-correct under the app's configured Vite `base` (via `import.meta.env.BASE_URL`) so it returns HTTP 200 in both dev (`/`) and production (`/neurons/`) rather than 404-ing to a broken image. The OFL-equivalent provenance / attribution for the icon pack SHALL ship alongside the assets (a `CREDITS.md` in the icon directory).

This requirement governs only warm chrome emoji. It SHALL NOT pixelize emoji inside the legible exam/long-form surfaces governed by the "Exam content and long-form prose SHALL stay legible" requirement; emoji that appear within those surfaces SHALL remain native. Emoji embedded in non-JSX contexts (e.g. transient toast strings or dynamic label-data arrays) MAY remain native and are not required to route through `EmojiIcon`.

#### Scenario: Mapped chrome emoji renders as a pixel img

- **GIVEN** the manifest maps `'⚡'` to filename `'26a1.png'`
- **WHEN** a chrome surface renders `<EmojiIcon char="⚡" size={20} />`
- **THEN** the DOM SHALL produce an `<img>` whose `src` ends with `icons/emoji/26a1.png` (base-correct under the app's Vite `base`), with `width="20"` and `height="20"` and inline style including `image-rendering: pixelated`
- **AND** the asset SHALL return HTTP 200 (not a 404 / broken image)

#### Scenario: Unmapped emoji falls back to a native span

- **GIVEN** the manifest has no entry for a given emoji character (no pixel-art asset exists for it yet)
- **WHEN** `<EmojiIcon char="🔥" size={20} />` mounts
- **THEN** the DOM SHALL produce a `<span>` containing the literal native emoji glyph (rendered by the OS emoji font), with no `<img>` element and no missing-glyph "tofu" box

#### Scenario: Variation selector is normalized before lookup

- **GIVEN** the manifest maps the bare codepoint `'⚔'` (U+2694) to its pixel-art filename
- **WHEN** `<EmojiIcon char="⚔️" />` mounts where the input carries a trailing U+FE0F variation selector
- **THEN** the normalize step SHALL strip U+FE0F and the lookup SHALL match the bare-codepoint asset, rendering the pixel `<img>` (not the text fallback)

#### Scenario: Exam / long-form emoji stay native

- **GIVEN** the legible exam/long-form surfaces (QuizModal stem/options/詳解, `/bank` body cells, HelpMenu paragraphs, bug-report body)
- **WHEN** any emoji appears inside one of those surfaces
- **THEN** it SHALL render as a native system emoji glyph and SHALL NOT be substituted with a pixel-art sprite
