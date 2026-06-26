# Decision log — 2026-06-25 — 詳解 image-tail + 簡解缺失 (handoff)

Context full → handoff + /clear + /spec resume to continue.

**Full handoff**: `/Users/kangweiling/.claude/scratch/handoff-neurons-detail-tables-and-jianjie-2026-06-25.md`

Two intertwined efforts (both edit hand-maintained SOURCE questions.json):
1. **image-tail** (29 q, change `add-neurons-explanation-tables-image-tail`): direct-extract figures (precise, `extract_tail.py`) + render-crop inner tables + text-recover 3 prose; 都要 = figure AND table. Owner's 3-type model in handoff Part A.
2. **簡解缺失** (~2,659 q): reconcile.py:83 dropped `### Key`; targeted by-id merge to prepend 簡解, NEVER full-regen. Owner CONFIRMED restore. Exclude 107-1/108-2/115-1. Handoff Part B.

Next: /spec resume → consult Codex on both methodologies → execute together → rebuild → deploy.
