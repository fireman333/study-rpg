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
 * Cron @ 00:00 UTC daily → R2-to-R2 backup with 30-day retention.
 *
 * Auth: every request requires `Authorization: Bearer <supabase-jwt>`.
 * JWT is verified against Supabase JWKS (cached in module scope, 1h TTL).
 * The `sub` claim is the ONLY source of user_id — request body fields are
 * ignored to prevent forging.
 */

import { handlePresign } from "./presign";
import { handleDeleteOrReset } from "./delete";
import { runBackupCron } from "./backup";
import { handleLeaderboard, runLeaderboardCron } from "./leaderboard";
import {
  handleNeuronsLeaderboard,
  runNeuronsLeaderboardCron,
} from "./neurons-leaderboard";
import { handleShoutout } from "./shoutout";
import { corsHeaders, preflightResponse } from "./cors";

// Cron expressions — MUST stay byte-for-byte identical with the strings in
// `cloudflare/sync-worker/wrangler.jsonc` `triggers.crons` array. Cloudflare
// passes the literal wrangler expression as `event.cron` to scheduled(), so
// the switch below dispatches on string equality. If wrangler.jsonc changes
// a cron schedule, update the matching constant here AND redeploy — otherwise
// the dispatch falls to the default branch and emits a console.error (loud
// failure, surfaces in Workers Logs).
const CRON_BACKUP_DAILY = "0 0 * * *" as const;
const CRON_LEADERBOARD_30MIN = "0,30 * * * *" as const;

/** Cloudflare Workers Rate Limiting binding (wrangler `ratelimits`). The shipped
 *  workers-types may not export this yet, so declare the minimal surface used. */
export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // R2 bindings
  R2_PRIMARY: R2Bucket;
  R2_BACKUP: R2Bucket;

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

      switch (url.pathname) {
        case "/presign":
          return await handlePresign(request, env, headers);
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
    // Dispatch by cron expression so a single scheduled() handler can serve
    // both the daily R2 backup and the every-30-min leaderboard pre-compute.
    // Cron strings come from wrangler.jsonc `triggers.crons` array and MUST
    // match the module-scope constants declared above; if mismatched, the
    // default branch logs a loud error (see `fix-leaderboard-cron-dispatch-
    // case-mismatch` change).
    switch (event.cron) {
      case CRON_BACKUP_DAILY:
        ctx.waitUntil(runBackupCron(env));
        return;
      case CRON_LEADERBOARD_30MIN:
        // Run 二階 + 神經元 leaderboard crons sequentially within the same
        // scheduled invocation per add-neurons-leaderboard design D6. Each
        // is independently fault-tolerant — if one throws, the other still
        // runs. Errors logged via console.error but not re-thrown.
        ctx.waitUntil(
          (async (): Promise<void> => {
            try {
              await runLeaderboardCron(env);
            } catch (err) {
              console.error("[scheduled] runLeaderboardCron failed", { err: String(err) });
            }
            try {
              await runNeuronsLeaderboardCron(env);
            } catch (err) {
              console.error("[scheduled] runNeuronsLeaderboardCron failed", { err: String(err) });
            }
          })(),
        );
        return;
      default:
        console.error(
          "[scheduled] unknown cron trigger — wrangler.jsonc may be out of sync with src/index.ts",
          { cron: event.cron, knownCrons: [CRON_BACKUP_DAILY, CRON_LEADERBOARD_30MIN] },
        );
    }
  },
};
