# Design — pixelate-neurons-helpmenu-emoji

## Decision 1: HelpMenu chrome/prose boundary (not wholesale)

`pixelate-neurons-emoji` (2026-06-07) excluded HelpMenu entirely via task 3.3's legible-surface list. The exclusion's intent was the teaching prose only. This change applies the existing spec boundary *within* HelpMenu: FAB / header / section icons / action buttons = chrome → `EmojiIcon`; teaching-paragraph inline emoji (✨ 🤔 ⭐ 🐞 …) = long-form prose → stay native. No new mechanism — reuses `EmojiIcon` + manifest as-is; coverage grows by PNG + map row exactly as the pack's CREDITS promised.

## Decision 2: Asset generation pipeline (same formula, floodfill chroma-key)

10 icons via codex CLI `gpt-image-2` (`-m gpt-5.5 --sandbox workspace-write --skip-git-repo-check … \$imagegen < /dev/null`, per `codex_image_gen.md`), one call per icon, sequential background batch. Post-process deviates from the 2026-06-07 run in one way: **corner floodfill** chroma-key (fuzz 10%) instead of global `-transparent`, so cream-adjacent object colors (gold star, medal) survive; then `-trim` → point-filter resize 60–62px → `-extent 64x64` → `-colors 16`. Output matches pack format (64×64 PaletteAlpha ≤16 colors, ~1–2 KB).

## Decision 3: 🌟 must not collide with ⭐ (regen with chunky sparkles)

First 🌟 render lost its thin sparkle rays to nearest-neighbor decimation (1024→62 samples ~1/16 pixels — 1–2px features vanish), leaving it nearly identical to the existing ⭐ `2b50`. Regenerated with explicitly LARGE four-pointed sparkle diamonds (≥¼ star size, dark outlines); v3 survives the downsample and reads distinctly at 20px. Lesson recorded: thin strokes in 1024px raws do not survive 16:1 point-filter downsampling — prompt for chunky features.

## Decision 4: Sizes per render site

Section icons 20px (matches prior 1.2rem glyph box), FAB ❓ 22px (44px round button), header 📖 16px (1rem h2), pill buttons 14px, bug-report CTA 15px — all `decorative` (adjacent text already names the control; avoids double-reading by screen readers).
