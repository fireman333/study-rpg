/**
 * study-rpg-sync-worker — auth-bridging presigner for R2 cloud sync.
 *
 * Endpoints:
 *   POST /presign          → presigned R2 URL (PUT or GET) for one bundle
 *   POST /delete-account   → list+delete all R2 objects under users/<sub>/
 *   POST /reset            → same as /delete-account (semantic difference is
 *                            on the client side — client keeps the Supabase
 *                            session after reset, signs out after delete)
 *
 * Crons (one job per invocation — see openspec `sync-worker-cpu-budget`):
 *   0,30 * * * *  二階 leaderboard KV pre-compute
 *   5,35 * * * *  neurons leaderboard KV pre-compute
 *   20 3 * * *    nightly note-image reclamation
 * The daily R2→R2 save backup is gone; every deploy now snapshots users/* first
 * (scripts/r2-snapshot.sh), retention is the backup bucket's lifecycle rule.
 *
 * Auth: every request requires `Authorization: Bearer <supabase-jwt>`.
 * JWT is verified against Supabase JWKS (cached in module scope, 1h TTL).
 * The `sub` claim is the ONLY source of user_id — request body fields are
 * ignored to prevent forging.
 */

import { handlePresign } from "./presign";
import { handleDeleteOrReset } from "./delete";
import { handleLeaderboard, runLeaderboardCron } from "./leaderboard";
import {
  handleNeuronsLeaderboard,
  runNeuronsLeaderboardCron,
} from "./neurons-leaderboard";
import { handleShoutout } from "./shoutout";
import { handleR2Read } from "./r2-read";
import { handleNoteImages } from "./note-images";
import { runNoteImageSweepCron } from "./note-image-sweep";
import { corsHeaders, preflightResponse } from "./cors";

// Cron expressions — MUST stay byte-for-byte identical with the strings in
// `cloudflare/sync-worker/wrangler.jsonc` `triggers.crons` array. Cloudflare
// passes the literal wrangler expression as `event.cron` to scheduled(), so
// the switch below dispatches on string equality. If wrangler.jsonc changes
// a cron schedule, update the matching constant here AND redeploy — otherwise
// the dispatch falls to the default branch and emits a console.error (loud
// failure, surfaces in Workers Logs).
const CRON_LEADERBOARD_30MIN = "0,30 * * * *" as const;
// Its own expression, offset from 二階, rather than a second job inside the same case: the Free
// plan's CPU limit is per invocation, and two ~9 ms jobs in one invocation measured 17–20 ms.
const CRON_NEURONS_LEADERBOARD_30MIN = "5,35 * * * *" as const;
// Off the leaderboard minutes on purpose so the sweep's own cost is what its minute bucket shows.
const CRON_NOTE_IMAGE_SWEEP_DAILY = "20 3 * * *" as const;

/** Cloudflare Workers Rate Limiting binding (wrangler `ratelimits`). The shipped
 *  workers-types may not export this yet, so declare the minimal surface used. */
export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // R2 bindings
  R2_PRIMARY: R2Bucket;

  // D1 + KV bindings (hospital leaderboard)
  LEADERBOARD_DB: D1Database;
  LEADERBOARD_KV: KVNamespace;

  // Rate Limiter binding (add-presign-put-rate-limit) — caps PUT presigns per
  // (user, bundle) to bound R2 Class-A PutObject cost. Optional so local dev /
  // older configs without the binding fail open (handled in presign.ts).
  PRESIGN_PUT_LIMITER?: RateLimiter;

  // Secrets (wrangler secret put)
  SUPABASE_JWKS_URL: string;
  SUPABASE_PROJECT_REF: string;
  R2_S3_ACCESS_KEY_ID: string;
  R2_S3_SECRET_ACCESS_KEY: string;
  R2_S3_ENDPOINT: string;

  // Vars (wrangler.jsonc)
  R2_BUCKET_NAME: string;
  CORS_ALLOWED_ORIGINS: string;
  PRESIGN_TTL_SECONDS: string;
  // PUT presign ttl (default 45s) — kept < the client's 60s cache margin so
  // every PUT re-presigns and is therefore rate-limitable. See presign.ts.
  PRESIGN_PUT_TTL_SECONDS?: string;

  // Optional secret (wrangler secret put) — comma-separated Supabase subs allowed
  // to call /shoutouts/:app/admin/*. Unset → admin endpoints return 403.
  SHOUTOUT_OWNER_SUBS?: string;

  // Secret (wrangler secret put) — HMAC key for the public player key that replaces the raw
  // `user_id` on every login-free surface (player-key.ts, change hash-leaderboard-user-ids).
  // Optional in the type so the Worker boots without it, but every surface that publishes a
  // player identity FAILS CLOSED when it is absent: 503 on reads, no snapshot write on cron.
  // Never a fallback to the raw id.
  LEADERBOARD_PLAYER_KEY_SECRET?: string;

  // Secret (wrangler secret put) — the HMAC key used INSTEAD of the one above while the rollout
  // compat window is open. Keys published next to raw ids during the window come from it, so
  // they stop meaning anything at the deadline. Must differ from LEADERBOARD_PLAYER_KEY_SECRET;
  // missing, short, or equal → the window stays closed. Delete it after the window (design D6).
  LEADERBOARD_PLAYER_KEY_WINDOW_SECRET?: string;

  // Var (wrangler.jsonc) — the deadline of the Worker-first rollout window, as `YYYY-MM-DD` or a
  // timestamp with an offset. Before it, public surfaces also carry the raw id in its old field
  // for client bundles that predate the change. Empty / absent / unparseable / past / more than
  // 14 days away → closed (the end state). See compatWindow() in player-key.ts.
  LEADERBOARD_RAW_ID_COMPAT_UNTIL?: string;

  // Supabase PUBLISHABLE (anon) key, used only by the /note-images endpoints. It already
  // ships inside the app's own frontend bundle, so it is not a secret — it identifies the
  // project, while the caller's forwarded JWT is what decides anything (migration 0030).
  // Optional so the Worker keeps booting without it and every other endpoint is unaffected;
  // the note-image endpoints then answer `anon_key_missing` rather than mysteriously.
  SUPABASE_ANON_KEY?: string;

  // Pooler connection string for the `note_image_sweeper` role (migration 0032), read on the
  // SCHEDULED path only. Deliberately NOT a service_role key: 0030 removed that one because it
  // bypasses RLS across the whole project, and 0001 leaves eight player tables guarded by RLS
  // alone. This role holds EXECUTE on two functions and no privilege on any table.
  //
  // A connection rather than a PostgREST call because PostgREST takes its role from a JWT, and this
  // project's legacy HS256 signing key is being retired — see note-image-sweep.ts.
  //
  // Optional so the Worker keeps booting without it; the sweep then refuses loudly and does nothing.
  NOTE_IMAGE_SWEEPER_DATABASE_URL?: string;

  // Hyperdrive binding for the same `note_image_sweeper` role — the transport that actually works.
  // The direct URL above cannot connect from a Worker: Supavisor's certificate chains to the
  // private "Supabase Root 2021 CA", and workerd's `startTls()` validates against public WebPKI
  // roots with no way to add a CA or relax verification, so the platform aborts the handshake
  // (diagnosed 2026-08-01; see sweepConnectionString in note-image-sweep.ts). Hyperdrive holds the
  // origin TLS question on Cloudflare's side and always encrypts to the database. When this binding
  // exists it wins over the URL. Creation steps live next to the commented binding in wrangler.jsonc.
  NOTE_IMAGE_SWEEPER_HYPERDRIVE?: Hyperdrive;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim());
    const corsAllowed = allowedOrigins.includes(origin);

    // Preflight
    if (request.method === "OPTIONS") {
      return preflightResponse(origin, corsAllowed);
    }

    const url = new URL(request.url);
    const headers = corsHeaders(origin, corsAllowed);

    try {
      // Neurons leaderboard routes (more specific prefix; must come BEFORE
      // the general /leaderboard/* dispatch since `/leaderboard/neurons/...`
      // also matches `/leaderboard/`).
      if (url.pathname.startsWith("/leaderboard/neurons/")) {
        return await handleNeuronsLeaderboard(request, env, headers);
      }
      // 二階 leaderboard routes (catches the remaining /leaderboard/* paths).
      if (url.pathname.startsWith("/leaderboard/")) {
        return await handleLeaderboard(request, env, headers);
      }
      // Shoutout board routes — hard-isolated namespace (add-neurons-shoutout-board).
      // ctx is needed for the Cache API put via waitUntil on the GET board read.
      if (url.pathname.startsWith("/shoutouts/")) {
        return await handleShoutout(request, env, headers, ctx);
      }
      // Community-note images (add-community-note-images). POST /note-images uploads,
      // GET /note-images/<id> serves. Identity comes from the caller's forwarded JWT, so
      // this Worker holds only the publishable anon key (migration 0030).
      if (url.pathname === "/note-images" || url.pathname.startsWith("/note-images/")) {
        return await handleNoteImages(request, env, headers, ctx);
      }

      switch (url.pathname) {
        case "/presign":
          return await handlePresign(request, env, headers);
        case "/r2/read":
          // Worker-proxied R2 read (route-r2-reads-through-worker-proxy) — CORS
          // on every status so the browser sees real 200/304/404/5xx instead of
          // R2's opaque, CORS-headerless errors. Reads only; PUT stays presigned.
          return await handleR2Read(request, env, headers);
        case "/delete-account":
        case "/reset":
          return await handleDeleteOrReset(request, env, headers);
        case "/health":
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...headers, "Content-Type": "application/json" },
          });
        default:
          return new Response("Not Found", { status: 404, headers });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[worker] unhandled error", { path: url.pathname, message });
      return new Response(JSON.stringify({ error: "internal_error", message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Dispatch by cron expression. Cron strings come from wrangler.jsonc `triggers.crons`
    // and MUST match the module-scope constants declared above; if mismatched, the default
    // branch logs a loud error (see `fix-leaderboard-cron-dispatch-case-mismatch` change).
    // Exactly one job per case — never sequence a second `run*Cron` inside a case
    // (openspec `sync-worker-cpu-budget`; guarded by __tests__/cron-dispatch.test.ts).
    switch (event.cron) {
      case CRON_LEADERBOARD_30MIN:
        ctx.waitUntil(
          runLeaderboardCron(env).catch((err: unknown) => {
            console.error("[scheduled] runLeaderboardCron failed", { err: String(err) });
          }),
        );
        return;
      case CRON_NEURONS_LEADERBOARD_30MIN:
        ctx.waitUntil(
          runNeuronsLeaderboardCron(env).catch((err: unknown) => {
            console.error("[scheduled] runNeuronsLeaderboardCron failed", { err: String(err) });
          }),
        );
        return;
      case CRON_NOTE_IMAGE_SWEEP_DAILY:
        // ⚠️ Awaited, NOT handed to ctx.waitUntil like the branches above — and that difference is
        // deliberate. `scheduled()` has no response to return early, so waitUntil buys nothing here
        // while adding a way to lose the work: under `wrangler dev --test-scheduled` the invocation
        // ends as soon as the trigger returns and the runtime cancelled this sweep outright
        // ("waitUntil() tasks did not complete within the allowed time"). Awaiting keeps the
        // invocation alive for the whole run, well inside the 15-minute cron wall clock.
        try {
          await runNoteImageSweepCron(env);
        } catch (err) {
          // runNoteImageSweepCron reports its own failures and returns a tally; this is the
          // backstop for anything it could not have anticipated.
          console.error("[scheduled] runNoteImageSweepCron failed", { err: String(err) });
        }
        return;
      default:
        console.error(
          "[scheduled] unknown cron trigger — wrangler.jsonc may be out of sync with src/index.ts",
          {
            cron: event.cron,
            knownCrons: [
              CRON_LEADERBOARD_30MIN,
              CRON_NEURONS_LEADERBOARD_30MIN,
              CRON_NOTE_IMAGE_SWEEP_DAILY,
            ],
          },
        );
    }
  },
};
