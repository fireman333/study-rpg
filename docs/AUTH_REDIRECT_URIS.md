# OAuth Redirect URI inventory

> Single source of truth for which origins Supabase Auth + Google OAuth accept
> as redirect targets. Audit this file before changing any sign-in flow.
>
> Spec: `openspec/specs/auth/spec.md` + delta in `openspec/changes/add-med-study-rpg-domain-migration/specs/auth/spec.md`.

## Current state (bake period — 2026-05-22 onwards)

The repo is mid-migration from `fireman333.github.io/study-rpg/` (GitHub Pages)
to `med-study-rpg.com` (Cloudflare Pages). Both URLs are live in parallel; the
Supabase Auth allowlist accepts both.

### Supabase dashboard → Authentication → URL Configuration

**Site URL** (primary callback target — Supabase uses this when no redirect URL
is requested explicitly):

```
https://fireman333.github.io/study-rpg/
```

(Remains pointed at GitHub Pages during bake. Bake-end follow-up flips to
`https://med-study-rpg.com/1st/`.)

**Additional Redirect URLs** (allowlist for explicit redirect requests):

```
https://fireman333.github.io/study-rpg/**
https://fireman333.github.io/study-rpg/hospital/**
https://med-study-rpg.com/1st/**
https://med-study-rpg.com/2nd/**
https://med-study-rpg.com/neurons/**
http://localhost:5173/**
http://localhost:5174/**
http://localhost:5175/**
```

The three `localhost` entries cover the dev servers for 一階 (5173), 二階 (5174), and neurons-tw (5175).

The `/neurons/**` entry is required for M_3rd neurons-tw OAuth callback per spec
`openspec/specs/neurons-deploy/spec.md` Req 3 ("OAuth sign-in SHALL succeed on
the `/neurons/` subpath using the shared Supabase project"). Added by change
`add-neurons-deploy`.

As of `split-medexam2-standalone` (§6), `https://fireman333.github.io/study-rpg/hospital/`
no longer serves the 二階 app — it 301-redirects to `https://med-study-rpg.com/2nd/`.
The `/study-rpg/hospital/**` allowlist entry above is therefore **moot** (no OAuth
callback lands on that path anymore) but harmless; it is removed alongside the other
GH-Pages entries in the bake-end follow-up below. The standalone 二階's origin is
unchanged (`med-study-rpg.com/2nd/`, already allowlisted), so the split itself needs
**no** Supabase / Google OAuth config change.

### Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client

**Authorized redirect URIs** (Supabase handles the OAuth dance; the only entry
here is Supabase's callback):

```
https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/callback
```

App origins are NOT listed in Google Cloud Console — Supabase fans out to the
configured Site URL / Additional Redirect URLs after Google completes consent.

## Bake-end follow-up (separate change, ~14–30 days after this one ships)

When the migration banner has been live long enough that GitHub Pages traffic
has dwindled to a trickle:

1. Update Supabase Site URL → `https://med-study-rpg.com/1st/`
2. Remove from Additional Redirect URLs:
   - `https://fireman333.github.io/study-rpg/**`
   - `https://fireman333.github.io/study-rpg/hospital/**`
3. Update this file to reflect the post-bake state.

## How to verify

After any allowlist edit, smoke test sign-in from each surviving origin:

```bash
# 1. Open https://med-study-rpg.com/1st/ in a clean profile
# 2. Click "Sign in with Google"
# 3. Complete Google consent
# 4. Confirm landing back on /1st/ with an authed session
# 5. Repeat for /2nd/ and (during bake) the legacy GH Pages URLs
```

If a redirect is rejected, Supabase surfaces an error like
`redirect_uri_mismatch` in the URL fragment of the callback page.
