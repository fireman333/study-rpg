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
import { corsHeaders, preflightResponse } from "./cors";

export interface Env {
  // R2 bindings
  R2_PRIMARY: R2Bucket;
  R2_BACKUP: R2Bucket;

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
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBackupCron(env));
  },
};
