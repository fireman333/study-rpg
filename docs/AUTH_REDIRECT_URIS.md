# OAuth Redirect URI inventory

> Single source of truth for which origins Supabase Auth + Google OAuth accept
> as redirect targets. Audit this file before changing any sign-in flow.
>
> Spec: `openspec/specs/auth/spec.md`.

## Current state (post `remove-medexam-tw-and-promote-neurons`, 2026-06-03)

GitHub Pages is **fully retired** and 一階 (`/1st/`) is removed. The app shell
is served only from `med-study-rpg.com` (Cloudflare Pages):

- `https://med-study-rpg.com/neurons/` — neurons (canonical, in this monorepo)
- `https://med-study-rpg.com/2nd/` — 二階 (standalone repo `study-rpg-2nd`, via the edge-router Worker)

All `fireman333.github.io/study-rpg/**` and `med-study-rpg.com/1st/**` origins are
gone. The Supabase project (`jakdyjxojokyqxeiuukx`) and its Auth config remain
shared across the surviving apps.

### Supabase dashboard → Authentication → URL Configuration

**Site URL** (primary callback target when no redirect URL is requested explicitly):

```
https://med-study-rpg.com/neurons/
```

(Flipped from the legacy GitHub Pages URL to the canonical neurons app when
GitHub Pages was retired by `remove-medexam-tw-and-promote-neurons`.)

**Additional Redirect URLs** (allowlist for explicit redirect requests):

```
https://med-study-rpg.com/2nd/**
https://med-study-rpg.com/neurons/**
http://localhost:5174/**
http://localhost:5175/**
```

The `/neurons/**` entry is required for neurons-tw OAuth callback per spec
`openspec/specs/neurons-deploy/spec.md` Req 3. The `/2nd/**` entry serves the
standalone 二階 app (`med-study-rpg.com/2nd/`, unchanged by the split + this
removal). The two `localhost` entries cover the dev servers for the standalone
二階 (5174) and neurons-tw (5175) — 一階's `localhost:5173` entry was dropped
with the app.

### Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client

**Authorized redirect URIs** (Supabase handles the OAuth dance; the only entry
here is Supabase's callback):

```
https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/callback
```

App origins are NOT listed in Google Cloud Console — Supabase fans out to the
configured Site URL / Additional Redirect URLs after Google completes consent.

## Owner action (tasks.md §7.5)

Apply the above in the Supabase dashboard when redeploying for this change:

1. Site URL → `https://med-study-rpg.com/neurons/`
2. Remove from Additional Redirect URLs (legacy, now 404):
   - `https://fireman333.github.io/study-rpg/**`
   - `https://fireman333.github.io/study-rpg/hospital/**`
   - `https://med-study-rpg.com/1st/**`
   - `http://localhost:5173/**`
3. Confirm the four surviving entries above remain.

## How to verify

After any allowlist edit, smoke test sign-in from each surviving origin:

```bash
# 1. Open https://med-study-rpg.com/neurons/ in a clean profile
# 2. Click "Sign in with Google"
# 3. Complete Google consent
# 4. Confirm landing back on /neurons/ with an authed session
# 5. Repeat for /2nd/ (served by the standalone repo)
```

If a redirect is rejected, Supabase surfaces an error like
`redirect_uri_mismatch` in the URL fragment of the callback page.
