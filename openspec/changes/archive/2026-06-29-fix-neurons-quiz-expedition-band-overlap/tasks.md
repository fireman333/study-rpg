# Tasks — fix-neurons-quiz-expedition-band-overlap

## 1. Implementation
- [x] 1.1 `MazeExpedition.tsx`: compact wrapper in-flow (`position: relative`, `flexShrink: 0`); drop the `absolute` + `top/left/right` overlay
- [x] 1.2 `MazeExpedition.tsx`: slim compact dims (h 92→72, marchers 54/44→44/36) + solid dark backing + bottom divider so it reads as a banner
- [x] 1.3 `QuizModal.tsx`: move the band from before the header (overlay) to an in-flow strip between the title bar and the question body
- [x] 1.4 Leave the homepage full band, hide preference, squad derivation, companions, reduced-motion untouched

## 2. Verification
- [x] 2.1 `tsc --noEmit` clean (neurons-tw)
- [x] 2.2 `squad-band` + `expedition` + `connectome-expedition` unit tests green (35)
- [x] 2.3 Chrome MCP smoke: child order is title bar → band → question; band bottom is above the stem top (positive gap, no overlap); band renders visibly on desktop (1440px)
- [ ] 2.4 Owner real-device smoke (mobile Safari + desktop): band sits below the title bar, does not overlap the question; on a desktop where it had "disappeared", re-enable via ❓ Help menu 「顯示遠征動畫」 and confirm the clean strip shows

## 3. Ship
- [ ] 3.1 verify → archive → commit (track-neurons) → merge main → push → CF Pages neurons deploy green
- [ ] 3.2 Prod smoke on `med-study-rpg.com/neurons/` (open a quiz → band sits below the title bar, no stem overlap)
