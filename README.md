# study-rpg

> An open-source **養成型 RPG engine** for exam prep.
> Default content pack: **台灣一階醫師國考**（Taiwan Stage-1 medical board exam, 一階醫師國考）.
> Default theme: pixel adventure RPG (GBA-era Pokémon / Stardew Valley vibe).

**Status**: M1 MVP scaffold — 藥理學 vertical slice in progress.

## Live demo

**[https://fireman333.github.io/study-rpg/](https://fireman333.github.io/study-rpg/)** (live after first push to GitHub + Pages enabled — see [Deploy your own fork](#deploy-your-own-fork) below).

## What this is

A Web game where you prepare for an exam by:

1. **閱讀** (Read) — accumulate focused minutes → XP, stamina, subject EXP.
2. **答題** (Quiz) — answer past-exam questions → 知識力 / 反應 / 記憶 stats; wrong answers go to SRS.
3. **打 Boss** (Boss fight) — once your subject EXP hits a threshold, run a 30-Q / 80-Q boss → badges + loot.
4. **抽卡 / 收集裝備** (Gacha-style loot) — every read session / quiz / boss triggers rolls (no payment, no IAP). 5-tier rarity with pity. Equip 4 slots (head / body / weapon / charm).

## What this is **not**

- Not a habit tracker (Habitica / LifeUp do that).
- Not a flashcard app (Anki / Memorang do that).
- Not a closed paywalled iOS app (Penpeer 醫師國考題庫 / AtQuiz do that, but Penpeer is dead 3 yr).
- Not just for Taiwan medical students — see [Fork it for your exam](#fork-it-for-your-exam) below.

## Repo layout (pnpm workspaces monorepo)

```
study-rpg/
├── packages/
│   ├── core/                    @study-rpg/core               — engine (stats / loot / SRS / boss)
│   ├── theme-pixel-medical/     @study-rpg/theme-pixel-medical — default visual theme
│   └── content-medexam-tw/      @study-rpg/content-medexam-tw  — 一階醫師國考 question bank
└── apps/
    └── medexam-tw/              @study-rpg/medexam-tw          — main dogfood app
```

## Quick start

```bash
pnpm install
pnpm --filter @study-rpg/content-medexam-tw build   # parses 陽明 .md → questions.json
pnpm --filter @study-rpg/medexam-tw dev             # opens http://localhost:5173/study-rpg/
```

Note: the content build script reads from
`$HOME/Desktop/國考/一階國考/陽明國考考古/_extracted/` by default — set
`MEDEXAM_SOURCE_ROOT=/path/to/extracted` to override.

## Fork it for your exam

Want a 律師國考 RPG? TOEFL RPG? 學測 RPG? You don't fork the engine — you write a new content pack.

1. Copy `packages/content-medexam-tw/` → `packages/content-<your-exam>/`
2. Replace the build script to emit your `questions.json` / `subjects.json` / `meta.json`
3. (Optional) Copy `packages/theme-pixel-medical/` → `packages/theme-<your-style>/` for different sprites + colors
4. Edit `apps/medexam-tw/src/App.tsx` to import your packs

See [`docs/CONTENT_SCHEMA.md`](./docs/CONTENT_SCHEMA.md) and [`docs/THEME_API.md`](./docs/THEME_API.md).

## Deploy your own fork

This repo ships a ready-to-go GitHub Pages deploy workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). After forking:

1. Push to `main` (or any branch — Pages deploys only on `main`).
2. Enable Pages: `Settings → Pages → Source = "GitHub Actions"`.
3. Grant write permissions: `Settings → Actions → General → Workflow permissions = "Read and write"`.
4. Next push to `main` (or manual `workflow_dispatch` from the Actions tab) deploys the site.

See [`.github/workflows/README.md`](./.github/workflows/README.md) for the full setup checklist and what CI does / does not do.

## License

- **Engine + themes** (`packages/core`, `packages/theme-*`, `apps/*`): **AGPL-3.0-or-later**
- **Default content pack** (`packages/content-medexam-tw`): **CC-BY-NC-4.0**
  - 題幹 © 中華民國考選部（公資源）
  - 詳解 © 陽明國考考古題小組 (https://sites.google.com/view/ymmedexam/ans) — 非商用 + 須署名

All loot is purely behaviour-triggered. **No in-app purchases. No real-money gacha.**

## Attribution / Takedown

This project credits 陽明國考考古題小組 for the 詳解 corpus and respects their non-commercial use clause. If the rights holders prefer that this content pack be removed, open an issue and the maintainer commits to a takedown within 24 hours.

## Roadmap

| Milestone | Scope |
|---|---|
| **M1 (MVP)** | 藥理學 slice + 1 boss + 4 stats + loot + auto-save + GitHub Pages deploy |
| M2 | 10 科開放、daily streak、SRS due queue |
| M3 | Public `@study-rpg/core` npm + example fork (`content-toefl-mini`) |
| M4 | Supabase cloud sync |
| M5 | Dorm scene / cosmetics / 模擬考 80-Q |
| M6 | Friend leaderboard / share card OG |
| M7 (stretch) | Community content/theme packs |
