# R2 capacity monitor

How to inspect Cloudflare R2 usage for `study-rpg-saves` + `study-rpg-saves-backup`. Equivalent of `supabase/sanity/capacity_monitor.sql` but for the R2 backend.

## Free-tier limits

| Quota | Free-tier cap | Owner's projected use |
|---|---|---|
| Storage | 10 GB | ~5–10 MB at 100 active users (50 KB/user × 3 bundles + backup) |
| Class A ops (writes) | 1M/月 | ~30 pushes/user/day → 90k/月 per user; 11k users worth of headroom |
| Class B ops (reads) | 10M/月 | ~3 pulls/user/day → 9k/月 per user; 110k users worth of headroom |
| Egress | unlimited (zero cost) | n/a |

Compared to Supabase free-tier (500 MB DB + 5 GB egress/月): R2 raises the practical ceiling by ~20×+ at zero ongoing cost.

## Quick checks

### Dashboard (Cloudflare → R2)

The fastest read on usage:

1. Cloudflare dashboard → **R2 Object Storage** → bucket `study-rpg-saves` → **Metrics** tab
2. Three KPIs to watch:
   - **Storage** — total bytes stored (raw + replicated). Trigger alert at 5 GB (50% of free tier).
   - **Class A operations** — PUT/COPY/DELETE/LIST. Spikes during dual-write phases.
   - **Class B operations** — GET/HEAD. Spikes when migration banner fires bulk read probes.
3. Same view available for `study-rpg-saves-backup` (should track ~30× primary because of 30-day backup retention).

### CLI sampling

```bash
# Total object count in primary bucket
wrangler r2 object list study-rpg-saves --prefix users/ | jq 'length'

# Per-user blob size (sample first 10 users)
wrangler r2 object list study-rpg-saves --prefix users/ \
  | jq -r '.[:30] | .[] | "\(.size)  \(.key)"' | sort -rn

# Backup bucket growth (last 7 day-prefixed snapshots)
wrangler r2 object list study-rpg-saves-backup --prefix backup/ \
  | jq -r '.[].key' | awk -F/ '{print $2}' | sort -u | tail -7
```

> **Note** (2026-05-20): wrangler v4.92.0 ships `wrangler r2 object list` but the JSON format may shift across minor versions. If the above breaks, fall back to the dashboard. For programmatic capacity monitoring, prefer the [Cloudflare API GraphQL Analytics](https://developers.cloudflare.com/analytics/graphql-api/) once owner sets it up.

### Per-bundle size sampling

Once dogfood has ≥ 10 users, sample one user's three bundles to set growth-rate baselines:

```bash
USER_UID="<some uid>"
for B in m1 m2 bookmarks; do
  SIZE=$(wrangler r2 object get "study-rpg-saves/users/${USER_UID}/${B}-snapshot.json.gz" --json 2>/dev/null | jq .size)
  echo "${B}: ${SIZE} bytes"
done
```

Expected ballpark (per `add-r2-cloud-sync-migration` design.md context, gzipped):

| Bundle | Casual user | Heavy user | Power user |
|---|---|---|---|
| `m1` (一階) | ~10 KB | ~50 KB | ~200 KB |
| `m2` (二階) | ~30 KB | ~150 KB | ~500 KB |
| `bookmarks` | ~1 KB | ~5 KB | ~20 KB |

If a user blob is **significantly larger** (e.g. m2 > 1 MB), grep the snapshot for unexpected accumulation: `hospital_question_history` is the most likely culprit since it stores per-question event history (no per-user cap today).

## Expected growth rate

Per active user (dogfood = owner + early friends):

- Daily writes: ~10–30 push events × 3 bundles (debounced 3-sec window collapses bursts) → **~30 Class A ops/day**
- Daily reads: ~3 tab-focus pulls × 3 bundles → **~9 Class B ops/day**
- Storage growth: dominated by `hospital_question_history` (~100 bytes/question after gzip). 100 questions/day per power user = ~10 KB/day in m2.

At 1000 active users:
- ~30k Class A/day × 30 days = **900k Class A/月** — 90% of free tier
- ~9k Class B/day × 30 days = 270k Class B/月 — 2.7% of free tier
- Storage growth ~10 MB/day across all users = **300 MB/月** primary, ~10× that in backup → could approach the 10 GB ceiling at ~30k active users with current backup retention

## Alarm thresholds

Manual checks suffice at owner scale (no DAU yet). When dogfood broadens:

| Threshold | Action |
|---|---|
| Storage > 5 GB | Reduce backup retention (30 day → 14 day in `src/backup.ts`); revisit per-user blob compression |
| Class A > 750k/月 (75% of cap) | Audit push debouncing; current 3-sec window may be too short under heavy quiz sessions |
| Class B > 7.5M/月 | Audit migration banner detection (every sign-in does 3× HEAD probes); consider caching |
| One user blob > 2 MB | Trigger schema rollup (e.g. cap `hospital_question_history` at last N events per question) |

## Comparison with Supabase backend (pre-migration)

For posterity — what we're moving away from:

| Metric | Supabase Postgres (M4) | Cloudflare R2 (R2 migration) |
|---|---|---|
| Storage cap | 500 MB DB | 10 GB (20×) |
| Egress cap | 5 GB/月 | unlimited (∞×) |
| Per-user footprint | ~280 KB casual / ~1.7 MB heavy | ~40 KB casual / ~250 KB heavy (gzip wins) |
| Practical ceiling | ~500–800 active users | ~30k active users at current backup retention |
| Cost beyond cap | $25/月 Supabase Pro | $0.015/GB/月 (post-10GB) |

Owner's constraint: no recurring monthly cost. R2's $0/月 free tier with ~30k user headroom satisfies it for the foreseeable future of this side-project's reach.
