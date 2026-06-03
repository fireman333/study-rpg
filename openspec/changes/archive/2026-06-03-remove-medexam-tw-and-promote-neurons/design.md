# Design — remove-medexam-tw-and-promote-neurons

Teardown change. No new runtime architecture; the design work is **sequencing + blast-radius containment** so deleting two apps doesn't break the surviving apps (neurons-tw in this repo, standalone 二階 + shared backend).

## Context

- Owner confirmed **一階 has no real players** → data-loss bits (drop tables, delete R2 blobs, `/1st/`→404) touch only dogfood/owner data.
- 二階 already extracted to standalone repo (`study-rpg-2nd`); the monorepo copy is dormant. **Shared backend (Supabase Auth + `bug_reports`, sync Worker, R2, D1) is consumed by the standalone 二階 and neurons — must NOT be torn down.** Only the strictly-一階 backend surfaces (4 tables, `m1` bundle) go.
- Decisions resolved via `/grill quick` 2026-06-03 — full log: `~/.claude/scratch/grilled-remove-medexam-tw-and-promote-neurons-2026-06-03.md`.

## Decisions

### D1 — GitHub Pages: fully retired (not redirect-stub)

`deploy.yml` builds 一階 only; after deletion it has no app. Owner chose **kill it entirely** over keeping a redirect stub. `/study-rpg/*` and `/study-rpg/hospital/*` → GitHub 404. The `/hospital/`→`/2nd/` 301 (in 一階 `public/404.html`) dies with the app; old github.io bookmarks break — **accepted** (二階 reachable at `med-study-rpg.com/2nd/`; GH Pages was already in deprecation bake per `add-med-study-rpg-domain-migration`). Mechanism: delete `.github/workflows/deploy.yml`; owner disables Pages in repo Settings (workflow removal alone leaves the last deploy live).

**Rejected**: redirect-stub (extra static site to maintain for a deprecating surface); move 二階 to GH root (二階 source is being deleted from the monorepo — nothing to serve).

### D2 — Root landing: keep existing hub minus the 一階 card

`med-study-rpg.com/` already serves `scripts/cf-landing-template.html` (3 cards: 一階 `/1st/`, 二階 `/2nd/`, neurons `/neurons/`) via `build-cf-pages-dist.mjs writeLanding()`. Owner chose **keep this hub** — remove the 一階 card, keep 二階 + neurons cards, scrub the meta description. **No new MigrationBanner, no `_redirects`→/neurons/.** (This overrides the 5/27 proposal's "add a root-level landing page or MigrationBanner" assumption.)

### D3 — neurons stays at `/neurons/`

"Promote neurons to canonical" is a *narrative/headline* promotion, not a URL move. neurons keeps `VITE_DEPLOY_BASE=/neurons/`; zero migration, neurons bookmarks unbroken. `/1st/` drops out of CF ROUTES → bare 404. **Rejected**: moving neurons to the vacated `/1st/` (breaks neurons bookmarks; `/1st/` semantics confusing for a neurons app).

### D4 — Teardown ordering: frontend-first, window = 0

Delete source + update pipelines + redeploy CF Pages **first** (一階 instantly stops being a write source), then immediately run backend wipe. No announcement window (no real players to warn). **Rejected**: backend-first (a stale 一階 tab could push new rows mid-wipe).

### D5 — `bug_reports` enum + Worker `m2` bundle: unchanged

Deleting 二階 *from the monorepo* does NOT remove 二階 *from existence* — the standalone repo still:
- writes `'medexam2-hospital-tw'` bug reports to the shared Supabase `bug_reports` table → `BUG_REPORT_APPS = ['medexam-tw','medexam2-hospital-tw']` stays whole; `'medexam-tw'` freezes to legacy only.
- PUT/GETs the `m2` R2 bundle via the shared sync Worker → `BUNDLES` keeps `'m2'`; only `'m1'` is removed.

This is the single highest-risk "obvious cleanup" trap in the change — flagged explicitly so a future pass doesn't shrink the enum or drop `m2`.

### D6 — Drop migration must patch RPCs, not just DROP tables

`0016_drop_medexam_tw_tables.sql` does more than `DROP TABLE`:
- The account-lifecycle RPCs (`delete_my_data` / `delete_my_account` / `export_my_data`, migration 0002) and `upsert_lww` (0003 + later) reference the 4 一階 tables by name. SECURITY DEFINER function bodies that `DELETE FROM player_state ...` **fail at runtime** once the table is dropped — breaking account-deletion / export flows for any surviving app that still calls these RPCs.
- Therefore the migration `CREATE OR REPLACE`s those functions to remove the 4-table references, in the same migration, before/with the `DROP TABLE ... CASCADE`.
- **Open verification (apply-time)**: confirm whether standalone 二階 / neurons still invoke these Supabase RPCs at all (the R2 migration moved most data ops off Postgres). If they're dead paths, the CASCADE drop is harmless either way; if live, the RPC patch is load-bearing. Either way patching is safe. Migration number is **0016** (0010–0015 already taken — the 5/27 proposal's `0010` is stale).

### D7 — Spec-delta baseline: post-split (prerequisite merge done)

`split-medexam2-standalone` and this change both touch `deploy-pipeline`. main's code was post-split but its specs were not (A1 divergence). Resolved by merging `track-m2 → main` (local, unpushed) first, so deltas here are authored against the 15-req post-split `deploy-pipeline`. Both archives push together at the merge gate → one CI deploy.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Drop a backend surface the standalone 二階 / neurons still use (`m2`, `bug_reports` enum, D1) | D5 — explicit "NO CHANGE" callouts; Worker smoke after redeploy confirms `m2`/`neurons`/`bookmarks` still presign |
| RPC runtime break for surviving apps | D6 — patch RPCs in the drop migration |
| `@study-rpg/core` accidentally depends on deleted theme/content | Verified zero refs (proposal); re-confirm with `grep -r "content-medexam-tw\|theme-pixel-medical\|content-medexam2-tw\|theme-pixel-hospital" packages/core apps/neurons-tw` during apply |
| `pnpm -r build` / `typecheck` breaks after dir deletion | Deleted dirs drop out of the `packages/*`+`apps/*` glob; re-run `pnpm install` + `pnpm -r typecheck` to confirm |
| CF Pages deploy breaks (missing 一階 dist input) | Both `build-cf-pages-dist.mjs` ROUTES and `deploy-cf-pages.yml` build step updated **atomically** (CLAUDE.md sharp-edge: CF/GH asymmetry) |
| Lingering `/1st/` references cause 404s on the landing or 404 SPA fallback | Grep `1st` across `scripts/`, workflows, landing template during apply |

## Verification plan

- `pnpm install && pnpm -r typecheck && pnpm -r build` green after deletions.
- `pnpm run build:cf` assembles `dist-cf/{neurons}` (no `1st`) without error.
- Worker smoke (`presign` for `m2`/`neurons`/`bookmarks` still 200; `m1` rejected) after Worker redeploy.
- Prod SPA three-piece on `med-study-rpg.com/neurons/` (in-app nav + direct URL + F5) + `/2nd/` still served by edge-router; `/1st/` returns 404; root hub renders 2 cards.
- Supabase: after `0016`, `\d player_state` errors (dropped); `delete_my_data()` runs without referencing dropped tables.
