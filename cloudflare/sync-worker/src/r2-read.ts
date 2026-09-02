/**
 * GET /r2/read?bundle=<m2|bookmarks|neurons>
 *
 * Worker-proxied R2 read (route-r2-reads-through-worker-proxy). Reads the
 * caller's OWN bundle snapshot from `R2_PRIMARY` server-side and streams it back
 * with the Worker's CORS headers on EVERY status. This lets a browser observe
 * the real HTTP status (200 / 304 / 404 / 5xx) instead of R2's opaque,
 * CORS-headerless S3 error/304 responses, which otherwise collapse in the
 * browser to `TypeError: Failed to fetch` and cannot be diagnosed.
 *
 * The R2 key is derived from the verified `jwt.sub` (bundleKey) — the client
 * NEVER supplies a key or user (tenancy isolation, mirrors handlePresign).
 * PUT / push is NOT proxied (stays a direct presigned R2 PUT) — see the
 * change's design D2 (proxying push would re-expose the Safari-flush storm).
 */

import { extractBearer, verifyJWT } from "./auth";
import { BUNDLES, bundleKey, type Bundle } from "./presign";
import type { Env } from "./index";

// Every response is JWT-authorized and per-user → never cache.
const NO_STORE = "private, no-store";

function jsonError(
  status: number,
  error: string,
  headers: Record<string, string>,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": NO_STORE },
  });
}

export async function handleR2Read(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, "method_not_allowed", headers);
  }

  // A partial gzip stream is not decodable by the client — reject ranged reads
  // rather than forward a 206. (Carries CORS via `headers`.)
  if (request.headers.get("Range") !== null) {
    return jsonError(416, "range_not_supported", headers);
  }

  // Auth — `sub` is the ONLY source of user identity (mirrors handlePresign).
  let userSub: string;
  try {
    const token = extractBearer(request);
    const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
    userSub = user.sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unauthenticated";
    return jsonError(401, message, headers);
  }

  // Bundle from the query string. The key is built from `jwt.sub` — any
  // client-supplied user/key hint is ignored (tenancy isolation).
  const rawBundle = new URL(request.url).searchParams.get("bundle");
  if (rawBundle === null || !BUNDLES.includes(rawBundle as Bundle)) {
    return jsonError(400, "invalid_bundle", headers);
  }
  const bundle = rawBundle as Bundle;
  const key = bundleKey(userSub, bundle);

  // Conditional read: hand the RAW `If-None-Match` header to the binding's
  // `onlyIf` (a Headers object). Do NOT hand-convert the quoted etag into an
  // R2Conditional string field — that risks etag-format mismatches with the
  // client's stored quoted etag. When the etag is EQUAL, the `If-None-Match`
  // (`etagDoesNotMatch`) precondition FAILS (= not modified) and R2 returns an
  // R2Object WITHOUT a body — R2 does NOT itself emit an HTTP 304.
  const ifNoneMatch = request.headers.get("If-None-Match");
  const opts: R2GetOptions | undefined = ifNoneMatch
    ? { onlyIf: new Headers({ "If-None-Match": ifNoneMatch }) }
    : undefined;

  let object: R2ObjectBody | R2Object | null;
  try {
    object = opts ? await env.R2_PRIMARY.get(key, opts) : await env.R2_PRIMARY.get(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "r2_get_failed";
    return jsonError(502, "r2_get_failed", headers, { detail: message });
  }

  // Object absent — first-ever pull / account reset. No object ⇒ no ETag.
  if (object === null) {
    return jsonError(404, "blob_missing", headers, { bundle });
  }

  // No body ⇒ the etag was equal, so the `If-None-Match` precondition FAILED
  // ⇒ not modified. Translate explicitly to HTTP 304, carrying CORS + the ETag
  // so the client's conditional-pull short-circuit works.
  if (!("body" in object)) {
    return new Response(null, {
      status: 304,
      headers: { ...headers, ETag: object.httpEtag, "Cache-Control": NO_STORE },
    });
  }

  // 200 — stream the gzip body verbatim. Set ONLY Content-Type + ETag +
  // Cache-Control; deliberately NO `Content-Encoding` (the client gunzips via
  // DecompressionStream — a `Content-Encoding: gzip` would make the browser
  // double-decompress). Do NOT copy stored HTTP metadata blindly, which could
  // reintroduce that header.
  return new Response(object.body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/gzip",
      ETag: object.httpEtag,
      "Cache-Control": NO_STORE,
    },
  });
}
