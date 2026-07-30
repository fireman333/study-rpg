/**
 * Community-note images (change `add-community-note-images`, study-rpg-2nd).
 *
 *   POST /note-images?key=<idempotency-key>&ack=1   → validate bytes, store, return id
 *   GET  /note-images/<id>                          → serve, or refuse identically
 *
 * Two things shape every line here.
 *
 * **The Worker has no table privileges, and after migration 0030 it has no privileged
 * key either.** 0021 revokes ALL from `service_role` on every community table and 0029
 * does the same for the four new ones, deliberately. 0030 then took identity out of this
 * file's hands entirely: the two functions it calls read `auth.uid()` rather than
 * accepting an account as a parameter, and are granted to `authenticated` / `anon`.
 *
 *   community_note_image_reserve   assign an identity, record the upload  (authenticated)
 *   community_note_image_authorize may this object be served, and as what  (anon too)
 *
 * So this Worker forwards **the caller's own JWT** and is no longer capable of claiming
 * that an upload belongs to somebody else — a guarantee it previously had only because we
 * trusted it to pass the right parameter. What it holds is the **publishable anon key**,
 * which already ships inside the app's own frontend bundle.
 *
 * An `<img>` sends no credential, so the read path falls back to the anon key alone, and
 * `auth.uid()` is then NULL — exactly the value the serving predicate wants for an
 * anonymous reader.
 *
 * ⚠️ `community_note_images_claim_expired` is NOT reachable from here any more: its caller
 * has to delete the R2 bytes, which a client cannot do, so 0030 left it `service_role`-only
 * rather than trade rows for leaked bytes. Retention is therefore an owner-run operation.
 * pg_cron is not installed on the project, so there is no third option today.
 *
 * **The bytes are validated here, not trusted from there.** See `note-image-webp.ts`.
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
async function rpc<T>(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
  /**
   * The caller's own access token, forwarded so the function's `auth.uid()` is the caller
   * and not this Worker. `null` means anonymous — the anon key alone, which is what an
   * `<img>` request amounts to.
   */
  bearer: string | null,
): Promise<T> {
  const anon = env.SUPABASE_ANON_KEY;
  if (!anon) {
    throw new RpcError(
      503,
      "anon_key_missing",
      `SUPABASE_ANON_KEY is not set; ${fn} is unreachable`,
    );
  }

  const res = await fetch(`https://${env.SUPABASE_PROJECT_REF}.supabase.co/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      // The publishable key identifies the project; the bearer identifies the caller. Only
      // the second one decides anything, and it is never this Worker's.
      apikey: anon,
      Authorization: `Bearer ${bearer ?? anon}`,
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

async function authenticate(request: Request, env: Env): Promise<{ sub: string; token: string }> {
  const token = extractBearer(request);
  const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
  // Verified here AND forwarded: this Worker still refuses a bad token early, and the
  // database still decides identity for itself from the same token.
  return { sub: user.sub, token };
}

// ── POST /note-images ────────────────────────────────────────────────────────

async function handleUpload(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  ctx?: ExecutionContext,
): Promise<Response> {
  let auth: { sub: string; token: string };
  try {
    auth = await authenticate(request, env);
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
        // No uploader parameter: migration 0030 reads auth.uid() from the forwarded token,
        // so this Worker cannot attribute an upload to another account even by mistake.
        p_idempotency_key: idempotencyKey,
        // Read out of the container, never taken from the request.
        p_byte_length: bytes.byteLength,
        p_width: profile.width,
        p_height: profile.height,
        p_format: STORED_OBJECT_MIME,
        p_image_ack: true,
      },
      auth.token,
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

  // ⚠️ No expiry sweep here any more. `community_note_images_claim_expired` stayed
  // `service_role`-only in 0030, because its caller must delete the R2 bytes and a client
  // cannot — opening it would have traded rows for leaked bytes. Retention is therefore an
  // owner-run operation, and pg_cron is not installed on the project.

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
  let bearer: string | null = null;
  if (request.headers.get("Authorization") !== null) {
    try {
      bearer = (await authenticate(request, env)).token;
    } catch (err) {
      return jsonError(401, err instanceof Error ? err.message : "unauthenticated", headers);
    }
  }

  let row: { format: string; byte_length: number } | undefined;
  try {
    const rows = await rpc<Array<{ format: string; byte_length: number }>>(
      env,
      "community_note_image_authorize",
      // No requester parameter either: anonymous means no bearer, and auth.uid() is then
      // NULL, which is exactly what the predicate wants for an <img>.
      { p_image_id: imageId },
      bearer,
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
