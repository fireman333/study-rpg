/**
 * Community-note images (change `add-community-note-images`, study-rpg-2nd).
 *
 *   POST /note-images?key=<idempotency-key>&ack=1   → validate bytes, store, return id
 *   GET  /note-images/<id>                          → serve, or refuse identically
 *
 * Two things shape every line here.
 *
 * **The Worker has no table privileges.** Migration 0021 revokes ALL from
 * `service_role` on every community table and 0029 does the same for the four new
 * ones, deliberately — anything holding the service key would otherwise be able to
 * invent an ownership row or a ledger row and walk straight past the checks. So the
 * entire database surface is three SECURITY DEFINER functions, and this file may not
 * grow a fourth kind of database access:
 *
 *   community_note_image_reserve        assign an identity, record the upload
 *   community_note_image_authorize      may this object be served, and as what
 *   community_note_images_claim_expired reclaim objects no note ever owned
 *
 * **The bytes are validated here, not trusted from there.** See `note-image-webp.ts`.
 *
 * ⚠️ Reversal of a recorded decision: `wrangler.jsonc` used to state that this Worker
 * deliberately holds no `SUPABASE_SERVICE_ROLE_KEY` because "migration is client-driven
 * … Worker never reads user data on behalf of users". Serving an image requires
 * resolving the note that displays it, which is exactly reading user data on a user's
 * behalf, so that stance does not survive this feature. The key is declared OPTIONAL so
 * the Worker keeps booting without it and every other endpoint is unaffected; these two
 * endpoints then fail loudly with `service_role_key_missing` rather than mysteriously.
 */

import { extractBearer, verifyJWT } from "./auth";
import {
  STORED_OBJECT_MAX_BYTES,
  STORED_OBJECT_MIME,
  validateSimpleWebp,
} from "./note-image-webp";
import type { Env } from "./index";

/**
 * Objects live OUTSIDE the `users/` prefix, and that is a decision rather than a
 * naming whim: the daily backup cron lists `users/` only, so images are not copied
 * into the backup bucket. Given that this capability provides no erasure at all, a
 * second copy on a 30-day retention would widen the thing the spec already admits is
 * its sharpest edge.
 */
export function noteImageKey(imageId: string): string {
  return `note-images/${imageId}`;
}

/** Lowercase canonical UUID, which is what Postgres emits and the composer inserts. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Mirrors the `char_length BETWEEN 8 AND 128` CHECK on the stored column. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._-]{8,128}$/;

/** Every refusal from the read path, and every response on the write path. */
const NO_STORE = "private, no-store";
/**
 * One day, and each word of this is load-bearing (design D7). A nonzero max-age is what
 * makes a render loop free — the serving path shares an account-wide request quota with
 * save synchronisation, that quota has been exhausted once, and this app has produced
 * render loops before. `private` keeps a visibility-gated response out of shared caches,
 * at the cost of no edge offload. One day rather than one year because a cache never
 * learns about revocation, so this is exactly the window in which a reader who already
 * fetched an image can still see it after concealment.
 */
const IMAGE_CACHE_CONTROL = "private, max-age=86400";

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

/**
 * THE refusal. Object absent, note not publicly visible, note taken down, switch off,
 * and even bytes missing from R2 — all of them produce this exact response, so
 * indistinguishability is a property of there being one function rather than of four
 * call sites remembering to agree. Uncacheable, so a refusal cannot be replayed from a
 * cache after the note's state changes.
 *
 * This capability makes no claim to resist timing analysis and does not equalise
 * response time.
 */
function readRefusal(headers: Record<string, string>): Response {
  return new Response(null, {
    status: 404,
    headers: { ...headers, "Cache-Control": NO_STORE },
  });
}

class RpcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Call one of the three permitted functions over PostgREST.
 *
 * Errors are mapped from SQLSTATE rather than from PostgREST's HTTP status, because the
 * SQLSTATE is what 0029 actually chose (`53400` for the bound, `42501` for the pause,
 * `23514` for the acknowledgement) and it survives PostgREST changing its own mapping.
 * Anything unrecognised becomes a 502 carrying the message — never a silent success.
 */
async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new RpcError(
      503,
      "service_role_key_missing",
      `SUPABASE_SERVICE_ROLE_KEY is not set; ${fn} is unreachable`,
    );
  }

  const res = await fetch(`https://${env.SUPABASE_PROJECT_REF}.supabase.co/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    let sqlstate = "";
    let message = body;
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string };
      sqlstate = typeof parsed.code === "string" ? parsed.code : "";
      message = typeof parsed.message === "string" ? parsed.message : body;
    } catch {
      // Not JSON — keep the raw text as the message. Deliberately not swallowed.
    }
    switch (sqlstate) {
      case "53400":
        throw new RpcError(429, "upload_bound_reached", message);
      case "42501":
        throw new RpcError(403, "refused", message);
      case "23514":
      case "23502":
        throw new RpcError(400, "invalid_upload", message);
      default:
        throw new RpcError(502, "rpc_failed", `${fn}: ${res.status} ${message}`);
    }
  }

  return (await res.json()) as T;
}

/**
 * PostgREST returns a set-returning function's rows as an array. For a `SETOF` of a
 * scalar the elements are bare values; for `RETURNS TABLE` they are objects. This
 * narrows the scalar case and **throws on anything else** rather than guessing — the
 * wire shape cannot be exercised until the service-role key exists, so a wrong
 * assumption has to be loud on first contact instead of producing an empty sweep that
 * looks like "nothing to do".
 */
function scalarRows(value: unknown, fn: string): string[] {
  if (!Array.isArray(value)) throw new RpcError(502, "rpc_shape", `${fn}: expected an array`);
  return value.map((row) => {
    if (typeof row === "string") return row;
    if (row && typeof row === "object") {
      const values = Object.values(row as Record<string, unknown>);
      if (values.length === 1 && typeof values[0] === "string") return values[0];
    }
    throw new RpcError(502, "rpc_shape", `${fn}: unexpected row shape ${JSON.stringify(row)}`);
  });
}

async function authenticate(request: Request, env: Env): Promise<string> {
  const token = extractBearer(request);
  const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
  return user.sub;
}

// ── POST /note-images ────────────────────────────────────────────────────────

async function handleUpload(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  ctx?: ExecutionContext,
): Promise<Response> {
  let userSub: string;
  try {
    userSub = await authenticate(request, env);
  } catch (err) {
    return jsonError(401, err instanceof Error ? err.message : "unauthenticated", headers);
  }

  const params = new URL(request.url).searchParams;

  // Carried as query parameters rather than custom headers on purpose: a custom
  // request header would have to be added to `Access-Control-Allow-Headers` or the
  // browser preflight strips it, and the failure mode of that is an upload that looks
  // like it hangs. Neither value is sensitive — the key is an opaque client-generated
  // token and the acknowledgement is a boolean.
  const idempotencyKey = params.get("key") ?? "";
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return jsonError(400, "invalid_idempotency_key", headers);
  }

  // Strict equality, not truthiness: the acknowledgement is the only pre-publication
  // safeguard on this path, so "the parameter was present in some form" is not the bar.
  if (params.get("ack") !== "1") {
    return jsonError(400, "image_acknowledgement_required", headers);
  }

  // Refuse on the declared length before buffering, then again on what actually
  // arrived — a lying Content-Length decides nothing.
  const declaredLength = Number(request.headers.get("Content-Length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > STORED_OBJECT_MAX_BYTES) {
    return jsonError(413, "too_large", headers, { limit: STORED_OBJECT_MAX_BYTES });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch (err) {
    return jsonError(400, "unreadable_body", headers, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const profile = validateSimpleWebp(bytes);
  if (!profile.ok) {
    // The client's own pre-check should have caught this, which is exactly why the
    // reason is reported: a disagreement between the two implementations is worth
    // seeing rather than smoothing over.
    return jsonError(422, "unacceptable_image", headers, {
      reason: profile.reason,
      ...(profile.detail ? { detail: profile.detail } : {}),
    });
  }

  let reserved: { image_id: string; replayed: boolean };
  try {
    const rows = await rpc<Array<{ image_id: string; replayed: boolean }>>(
      env,
      "community_note_image_reserve",
      {
        p_uploader: userSub,
        p_idempotency_key: idempotencyKey,
        // Read out of the container, never taken from the request.
        p_byte_length: bytes.byteLength,
        p_width: profile.width,
        p_height: profile.height,
        p_format: STORED_OBJECT_MIME,
        p_image_ack: true,
      },
    );
    if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.image_id !== "string") {
      throw new RpcError(502, "rpc_shape", "community_note_image_reserve: expected one row");
    }
    reserved = rows[0];
  } catch (err) {
    if (err instanceof RpcError) return jsonError(err.status, err.code, headers, { detail: err.message });
    throw err;
  }

  // A replay already has its bytes stored, and they may not be rewritten.
  if (!reserved.replayed) {
    let written: unknown;
    try {
      written = await env.R2_PRIMARY.put(noteImageKey(reserved.image_id), bytes, {
        httpMetadata: { contentType: STORED_OBJECT_MIME },
        // "The store SHALL refuse any write to an identity it has already assigned,
        // including one issued by this capability's own upload path." A conditional
        // put makes that the store's answer rather than a check we could forget.
        onlyIf: { etagDoesNotMatch: "*" },
      });
    } catch (err) {
      return jsonError(502, "r2_put_failed", headers, {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    if (written === null) {
      // An assigned identity already holds bytes while the ledger says this upload is
      // new. That should be unreachable; log it loudly rather than overwrite.
      console.error("[note-images] refused overwrite of an assigned identity", {
        imageId: reserved.image_id,
      });
      return jsonError(409, "identity_already_written", headers);
    }
  }

  // Opportunistic, bounded, and after the response is decided so it costs the author
  // nothing. Nothing else will do this: pg_cron is not installed on the project, so
  // without a caller here the retention promise does not run at all.
  ctx?.waitUntil(sweepExpired(env));

  return new Response(JSON.stringify({ imageId: reserved.image_id, replayed: reserved.replayed }), {
    status: reserved.replayed ? 200 : 201,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": NO_STORE },
  });
}

// ── GET /note-images/<id> ────────────────────────────────────────────────────

async function handleRead(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  imageId: string,
): Promise<Response> {
  if (!UUID_RE.test(imageId)) return readRefusal(headers);

  // Unauthenticated is the NORMAL case: a public reader's `<img>` sends no
  // Authorization header, and an image element cannot send one. The author path is a
  // separate authenticated `fetch` (design D6) — a credential in the URL was rejected
  // because it is readable from the document, lands in history and logs, travels when
  // copied, and cannot be confined to the browser that obtained it.
  //
  // A PRESENT but invalid token is a 401 rather than the identical refusal, and that is
  // deliberate: it discloses nothing about any object, and silently downgrading a
  // broken token to "anonymous" would turn an expired session into an unexplained
  // disappearance of the author's own images.
  let requester: string | null = null;
  if (request.headers.get("Authorization") !== null) {
    try {
      requester = await authenticate(request, env);
    } catch (err) {
      return jsonError(401, err instanceof Error ? err.message : "unauthenticated", headers);
    }
  }

  let row: { format: string; byte_length: number } | undefined;
  try {
    const rows = await rpc<Array<{ format: string; byte_length: number }>>(
      env,
      "community_note_image_authorize",
      { p_image_id: imageId, p_requester: requester },
    );
    if (!Array.isArray(rows)) throw new RpcError(502, "rpc_shape", "authorize: expected an array");
    row = rows[0];
  } catch (err) {
    if (err instanceof RpcError && err.status >= 500) {
      // An infrastructure failure is not a refusal — saying so keeps a 5xx from being
      // read as "this image does not exist".
      return jsonError(err.status, err.code, headers, { detail: err.message });
    }
    if (err instanceof RpcError) return readRefusal(headers);
    throw err;
  }

  // Zero rows is the answer to every authorization question, by construction.
  if (!row || typeof row.format !== "string") return readRefusal(headers);

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await env.R2_PRIMARY.get(noteImageKey(imageId));
  } catch (err) {
    return jsonError(502, "r2_get_failed", headers, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (object === null || !("body" in object)) {
    // The row says serve and the bytes are gone — a divergence worth seeing, but the
    // reader gets the same refusal as everyone else so this cannot become an oracle.
    console.error("[note-images] authorized object missing from R2", { imageId });
    return readRefusal(headers);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...headers,
      // From the format detected when the object was written, never reflected from what
      // the uploader declared — and `nosniff` because refusing script-bearing formats
      // is not by itself enough: bytes a client is willing to re-interpret can become
      // active content whatever their container.
      "Content-Type": row.format,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": IMAGE_CACHE_CONTROL,
    },
  });
}

// ── expiry ───────────────────────────────────────────────────────────────────

/**
 * Reclaim objects no note has EVER owned. The function deletes the rows and returns
 * their identities; deleting the bytes is this side's job, because the database cannot
 * reach R2. Counts are logged unconditionally — a sweep that silently claimed nothing
 * and a sweep that could not run are otherwise the same log line.
 */
export async function sweepExpired(env: Env, limit = 100): Promise<void> {
  let ids: string[];
  try {
    const raw = await rpc<unknown>(env, "community_note_images_claim_expired", { p_limit: limit });
    ids = scalarRows(raw, "community_note_images_claim_expired");
  } catch (err) {
    console.error("[note-images] expiry sweep could not run", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (ids.length === 0) {
    console.log("[note-images] expiry sweep: nothing to claim");
    return;
  }

  let deleted = 0;
  let failed = 0;
  try {
    await env.R2_PRIMARY.delete(ids.map(noteImageKey));
    deleted = ids.length;
  } catch (err) {
    failed = ids.length;
    // The rows are already gone, so the objects are unreachable either way; what is
    // lost is storage, and it will not be retried. Loud, and deliberately not fatal.
    console.error("[note-images] expiry sweep claimed rows but could not delete bytes", {
      count: ids.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  console.log("[note-images] expiry sweep done", { claimed: ids.length, deleted, failed });
}

// ── router ───────────────────────────────────────────────────────────────────

export async function handleNoteImages(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  ctx?: ExecutionContext,
): Promise<Response> {
  const path = new URL(request.url).pathname;

  if (path === "/note-images") {
    if (request.method !== "POST") return jsonError(405, "method_not_allowed", headers);
    return await handleUpload(request, env, headers, ctx);
  }

  const match = /^\/note-images\/([^/]+)$/.exec(path);
  if (match) {
    // A refusal, not a 405: the method is the only thing a probe would learn from, and
    // the read path's answers are meant to be uniform.
    if (request.method !== "GET") return readRefusal(headers);
    return await handleRead(request, env, headers, match[1]);
  }

  return jsonError(404, "not_found", headers);
}
