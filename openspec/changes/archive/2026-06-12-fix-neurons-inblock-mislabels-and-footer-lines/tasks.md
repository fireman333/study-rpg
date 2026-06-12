# Tasks

## 1. Find in-block mislabels
- [x] 1.1 Detect residual scrambling: post-fix subject-range overlap flags 107-1 + 108-2 醫學二 (others = 微免-split false positives).
- [x] 1.2 Full content scan of both papers (2 Fable-5 agents, 100 Q each) → 8 in-block mislabels.

## 2. Apply
- [x] 2.1 Surgical 8 `subject` edits in reconciled source (id unchanged; exact-match).
- [x] 2.2 Add standalone `醫學一`/`醫學二` footer-line rule to `normalizeExplanation`.
- [x] 2.3 Rebuild content + copy-content.

## 3. Verify
- [x] 3.1 107-1/108-2 醫學二 blocks now contiguous (寄生蟲 Q29-35 · 公衛 Q36-50 · 藥理 Q51-75 · 病理 Q76-100).
- [x] 3.2 Footer lines 362 → 0; 0 content lines changed; 0 of 2325 參考資料 headers lost.
- [x] 3.3 `pnpm -r typecheck` clean; 635 vitest green; content build 4600/0/4600; app build green.
- [ ] 3.4 Owner prod spot-check: 107-1 環境衛生題 now under 公衛 family.
