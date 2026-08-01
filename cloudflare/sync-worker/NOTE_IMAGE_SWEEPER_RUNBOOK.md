# `note_image_sweeper` — credential runbook

The nightly note-image reclamation sweep (change `sweep-abandoned-note-image-uploads`, migration
`0032`) runs as a dedicated Postgres role. This is how to rotate it, how to stop it, and what to do
instead of the thing that looks like it would help.

Written to be read under stress, so every step is a command you can paste.

---

## What the credential is, and the three places it lives

`note_image_sweeper` is a Postgres `LOGIN` role holding `EXECUTE` on exactly two functions —
`community_note_images_claim_expired` and `community_note_images_confirm_reclaimed` — and **no
privilege on any table or sequence**. Beyond those two it can do no more than an anonymous caller
(some `public` functions are granted to `PUBLIC`, which every role belongs to; `anon` holds the same
set). It is deliberately **not** granted to `authenticator`.

Its password exists in three places, and that is the thing most likely to bite you:

| Where | What it holds |
|---|---|
| The Postgres role itself | the password |
| Cloudflare Hyperdrive config `1ce89174f3274fb48b9110aed0577e12` | a copy, inside its connection string |
| Worker secret `NOTE_IMAGE_SWEEPER_DATABASE_URL` | another copy — **and this path is dead** |

⚠️ **The third one is the hazard.** The direct connection string cannot work from a Worker at all
(see "Why Hyperdrive" below), so nothing exercises it — but the credential in it is real. Rotate the
password without touching it and you leave a live secret that no failure will ever surface.

---

## Rotating the password

Order matters: change the role last-but-one and Hyperdrive last, so there is no window where the
sweep holds a password the database has already forgotten. Run everything from a shell where the new
password is in `$PW` via `read -rs`, never as a literal.

**1. Generate one. Alphanumeric only** — the connection string is a URL, and `@ / : # ?` would need
percent-encoding.

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40; echo
```

**2. Set it on the role.** ⚠️ Run from `~/coding-scratch/study-rpg-2nd` — the Supabase project link
lives there, not in this repo, and anywhere else fails with `Cannot find project ref`.

```bash
cd ~/coding-scratch/study-rpg-2nd && umask 077 && printf 'new password: ' && read -rs PW && echo && TMP=$(mktemp) && printf "ALTER ROLE note_image_sweeper LOGIN PASSWORD '%s';\n" "$PW" > "$TMP" && supabase db query --linked -f "$TMP"; rm -f "$TMP"
```

**3. Update Hyperdrive** — same host and role, **session pooler on 5432**.

```bash
cd ~/coding-scratch/study-rpg/cloudflare/sync-worker && npx wrangler hyperdrive update 1ce89174f3274fb48b9110aed0577e12 --connection-string="postgresql://note_image_sweeper.jakdyjxojokyqxeiuukx:$PW@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

**4. Deal with the dead fallback secret.** Deleting it is the honest choice — it cannot work, and an
unused credential is pure liability. Keeping it only makes sense if you intend to test a future
platform fix by removing the Hyperdrive binding.

```bash
cd ~/coding-scratch/study-rpg/cloudflare/sync-worker && npx wrangler secret delete NOTE_IMAGE_SWEEPER_DATABASE_URL
```

⚠️ If you delete it, `sweepConnectionString` will throw a config error should the binding ever go
missing — which is the correct loud failure, not a regression.

**5. `unset PW`, then verify** with the recipe at the bottom.

---

## Stopping the sweep

Four levers, smallest blast radius first. Pick the smallest one that achieves what you need.

**1. Remove the cron trigger** — the sweep stops, nothing else changes. Reversible in one line.

Comment out `"20 3 * * *"` in `wrangler.jsonc` `triggers.crons`, then:

```bash
cd ~/coding-scratch/study-rpg/cloudflare/sync-worker && npx wrangler deploy
```

**2. Revoke the grants** — the sweep fails loudly at the database, everything else is untouched.
Useful when you want evidence in the logs that someone tried.

```sql
REVOKE EXECUTE ON FUNCTION
  public.community_note_images_claim_expired(INT),
  public.community_note_images_confirm_reclaimed(UUID[])
  FROM note_image_sweeper;
```

**3. Take away login** — immediate, blocks new connections, keeps the role and its grants intact for
later.

```sql
ALTER ROLE note_image_sweeper NOLOGIN;
```

**4. Drop the role** — only after (2), since Postgres refuses to drop a role that still owns
privileges.

```sql
DROP ROLE note_image_sweeper;
```

⚠️ Levers 2–4 leave the cron firing. It will fail, log `run aborted`, and reclaim nothing — safe, but
noisy every night. Pair them with lever 1 if the stop is meant to last.

---

## What NOT to do

⚠️ **Do not press "Reset database password" in the Supabase dashboard.** It resets the project's
`postgres` superuser, does **nothing** to `note_image_sweeper`, and breaks every existing connection
that used it. It is the most prominent button on the page and it is the wrong one for every scenario
in this document.

⚠️ **Do not run `supabase db push`.** Migration history stopped at `0019`; everything since has been
applied out of band, and a push would replay `0021`.

⚠️ **Do not point Hyperdrive at port 6543.** That is Supavisor's transaction mode, and Hyperdrive
does its own pooling — stacking them is a configuration that can appear to work and misbehave later.
Session pooler, 5432.

⚠️ **Do not "fix" a TLS problem by weakening TLS.** If the sweep ever fails on certificates again,
the answer is the CA, not `sslmode=disable`. The credentials cross the public internet.

---

## Manual reclamation, if the sweep is stopped

`0032` dropped `claim_expired`'s grant to `service_role`, so the previous manual route is gone. Your
own privileged SQL access is unaffected by that revoke and remains the recovery path.

```bash
cd ~/coding-scratch/study-rpg-2nd && supabase db query --linked -f <(echo "SELECT t.id FROM public.community_note_images_claim_expired(25) AS t(id);")
```

⚠️ **That deletes rows and writes tombstones. It does not delete the R2 bytes** — the function cannot
reach R2, which is the whole reason the sweep exists. You must then delete each returned id and clear
its tombstone yourself:

```bash
cd ~/coding-scratch/study-rpg/cloudflare/sync-worker && npx wrangler r2 object delete study-rpg-saves/note-images/<id> --remote
```

```sql
SELECT public.community_note_images_confirm_reclaimed(ARRAY['<id>']::uuid[]);
```

⚠️ **Confirm only what you actually deleted.** Confirming an id whose bytes are still stored forgets
them permanently — nothing anywhere will record that the object exists. A tombstone left behind is
recoverable; a forgotten object is not.

---

## Verifying any of the above

Trigger a run against production without waiting for 03:20 UTC. ⚠️ Port 8787 is usually occupied by
something else — use 8791.

```bash
cd ~/coding-scratch/study-rpg/cloudflare/sync-worker && npx wrangler dev --remote --test-scheduled --port 8791
```

Then, in another shell:

```bash
curl -s "http://127.0.0.1:8791/__scheduled?cron=20+3+*+*+*"
```

Healthy output, in the `wrangler dev` log:

```
[note-image-sweep] run complete { batches: 1, claimed: 0, deleted: 0, deleteFailures: 0, confirmed: 0, stopped: 'drained' }
```

⚠️ **`claimed: 0` is a success**, not a failure — it means nothing was due. A run that reclaims
nothing still logs, deliberately, because a sweep that has silently stopped and a sweep with nothing
to do are otherwise the same absence.

Failure looks like `run aborted` with a `phase` naming where it got to: `claim#1` means the database
connection never established.

Database-side check:

```sql
SELECT
  (SELECT count(*) FROM public.community_note_images i
    WHERE i.created_at < now() - INTERVAL '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.community_note_image_owners o WHERE o.image_id = i.id))
    AS eligible_now,
  (SELECT count(*) FROM public.community_note_image_reclaimed) AS tombstones_outstanding;
```

A tombstone older than a day means byte deletion is failing — the row is gone, the bytes are not, and
that row is the only thing that still knows.

---

## Why Hyperdrive, so nobody "simplifies" it away

A Worker **cannot** connect directly to Supabase Postgres. Supavisor presents a certificate chained
to the private **"Supabase Root 2021 CA"**; workerd's `startTls()` validates against public WebPKI
roots only and exposes no way to add a CA or relax verification — `connect()` accepts just
`secureTransport` and `allowHalfOpen`. The handshake aborts about one RTT after the upgrade.

Verified 2026-08-01 from both remote and local workerd, on both pooler ports, while `openssl` from
the same egress IP completed the handshake and an identical `startTls` upgrade to a public-CA
endpoint succeeded. No driver setting and no driver swap changes this; the trust store belongs to the
platform.

⚠️ It also **hangs rather than erroring**: the rejected socket closes cleanly, postgres.js's cf build
cancels its connect timer and silently reconnects (`postgres/cf/src/connection.js:447,452`), so
`connect_timeout` is re-armed per attempt and never elapses. The sweep's own 45-second deadline is
the only reason such a failure is visible at all — do not remove it.

Hyperdrive always speaks TLS to the origin, and can be raised to `verify-full` by uploading
Supabase's CA (`wrangler cert upload certificate-authority` + `--ca-certificate-id`) — something the
direct path could never do.
