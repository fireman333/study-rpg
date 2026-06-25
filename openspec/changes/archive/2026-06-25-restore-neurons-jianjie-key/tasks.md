# Tasks — restore-neurons-jianjie-key

> Targeted by-id merge restoring the dropped 簡解 (`### Key`) into 陽明-path explanations of the
> hand-maintained corpus. NEVER re-run `reconcile_all.py`. Never touch `id` / `answer`.

## 1. Repair tooling (done in this change)

- [x] 1.1 `reconcile/restore_jianjie_key.py` — by-id merge: map source `### Key` → corpus by
  `(book, year, session, qNumber)`, NFKC-normalize Key, prepend `簡解：` block + divider, skip
  already-present / noise / excluded, reformat the 42 old-label questions; dry-run by default
- [x] 1.2 Root-cause comment at `reconcile.py:83` cross-referencing the repair script

## 2. Dry-run validation

- [x] 2.1 Run dry-run → report `prepend=2810 / reformatted=42 / already_sentinel=0 /
  already_contains=140 / noise_skip=9 / ambiguous=0 / excluded=600 / no_key=999`, total 4600
- [x] 2.2 Verify mapping (stem match spot-checks), exclusions (107-1/108-2/115-1 + 104/105), and
  exact round-trip serialization

## 3. Apply + rebuild

- [x] 3.1 `python reconcile/restore_jianjie_key.py --apply` → rewrite `questions.json` (2852 changed)
- [x] 3.2 Assert post-apply: 4600 questions, every `id`/`answer` byte-identical to pre-apply,
  changed objects are exactly the 2852 explanations
- [x] 3.3 `pnpm run build:neurons-content` (4600/0) + `node apps/neurons-tw/scripts/copy-content.mjs`

## 4. Verify + ship

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw test` (676/676) + `pnpm -r typecheck` clean
- [x] 4.2 `/verify` — Chrome MCP `/bank` smoke: restored question renders 簡解 → divider → 詳解
- [ ] 4.3 Deploy neurons (Cloudflare Pages) + prod-verify — DEFERRED: ships in the bundled
  `track-neurons` → `main` merge together with `add-neurons-explanation-tables-image-tail` (Part A)
- [x] 4.4 `/opsx:archive` (sync the `neurons-corpus-ingestion` delta) + commit (explicit per-file
  `git add` of content/data + reconcile + openspec paths only — never `git add -A`)
