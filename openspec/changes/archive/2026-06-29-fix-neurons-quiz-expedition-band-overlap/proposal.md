## Why

In `QuizModal`, the compact 神經元遠征隊 expedition band was an **`absolute` overlay pinned to the modal top** (`top: 0`, height 92px, `opacity 0.5`). Because it was an out-of-flow positioned sibling, it painted (translucent) **over** the header and the **top ~27–44px of the question body** — i.e. over the first line of the question stem. The owner hit this on mobile: 「手機的出征動畫會和題目重疊到」. It is not mobile-only — the overlap reproduces on desktop too (confirmed at 1440px: the band's translucent sprites sit over the stem's first line). The current spec already requires the compact band to be "behind the question stem/options **without obscuring them**" — the absolute-overlay implementation violated that intent.

The companion report 「電腦版的動畫不見了」 is a **per-device preference**, not a render bug: both bands (homepage + quiz) share one persisted `expeditionHidden` flag, and there is no viewport-gating in the code — the band renders on desktop whenever it is not hidden (verified on a clean profile). So a desktop where it "disappeared" has the shared − hide toggle set; it is restored via the ❓ Help menu 「顯示遠征動畫」. No code change is needed for that; this change makes the band, when shown, a clean non-overlapping strip on every viewport.

## What Changes

- **`MazeExpedition.tsx` (compact mode only)**: the compact band is no longer an `absolute` overlay. Its wrapper is now in-flow (`position: relative`, `flexShrink: 0`), so it occupies its own space in the modal's flex column. Compact dimensions slimmed (height 92 → 72; marcher sizes 54/44 → 44/36) and given a solid dark backing + bottom divider so it reads as an intentional banner rather than a faint wash. The homepage full band is unchanged (it was already in-flow `relative`).
- **`QuizModal.tsx`**: the band moves from before the header (absolute overlay) to **between the title bar and the question body** (an in-flow strip). The title bar (with the ✕ close) stays at the very top for reachability; the band sits below it; the question stem/options sit below the band — so the band can never overlap the content on any viewport.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-maze-expedition`: the compact QuizModal band is an in-flow strip that reserves its own space between the title bar and the question (it no longer renders as a translucent overlay positioned "behind" the content), so it never overlaps the stem/options on any viewport.

## Impact

- **Modified**: `apps/neurons-tw/src/components/MazeExpedition.tsx`, `apps/neurons-tw/src/components/QuizModal.tsx` (two files).
- **No** game-state / sync / schema / data change. Purely presentational. The hide preference, squad derivation, companions, reduced-motion, and the homepage full band are all unchanged.
- **Verification**: typecheck clean; `squad-band` / `expedition` / `connectome-expedition` unit tests (35) green; Chrome MCP smoke confirms the band sits between title bar and question with a positive gap to the stem (no overlap) and renders visibly on desktop.
