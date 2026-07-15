/**
 * POST /presign — returns a presigned R2 URL scoped to the JWT-bound user.
 *
 * Request body:
 *   { bundle: 'm2' | 'bookmarks' | 'neurons',
 *     op: 'put' | 'get',
 *     schema_version?: number  // positive integer; PUT only; opt-in P1
 *   }
 * Response:
 *   { url: string,
 *     expiresAt: number,
 *     key: string,
 *     requiredHeaders?: Record<string,string>  // when SV signed, lists exact
 *                                              // headers client MUST send at PUT
 *   }
 *
 * The R2 key is ALWAYS `users/<jwt.sub>/<bundle>.json.gz` — body fields like
 * user_id are ignored to prevent forging across tenancies.
 *
 * schema_version enforcement (add-bundle-schema-version-guard, P1 opt-in):
 *   - PUT ops with `schema_version`: Worker HEADs existing R2 blob, compares
 *     against existing `customMetadata['schema-version']` (or 0 if absent/
 *     legacy), refuses 409 on downgrade, otherwise signs the value into the
 *     presigned URL via `x-amz-meta-schema-version` header in SigV4 scope.
 *   - PUT ops without `schema_version`: legacy path, no header signed, no
 *     enforcement. This branch is removed in Phase 2 follow-up change.
 *   - GET ops: schema_version ignored entirely (read path unaffected).
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

// `m1` (一階 medexam-tw) removed by remove-medexam-tw-and-promote-neurons.
// `m2` retained — the standalone 二階 app still PUT/GETs it via this shared Worker.
export type Bundle = "m2" | "bookmarks" | "neurons";
type Op = "put" | "get";

export const BUNDLES: ReadonlyArray<Bundle> = ["m2", "bookmarks", "neurons"];
const OPS: ReadonlyArray<Op> = ["put", "get"];

export function bundleKey(userSub: string, bundle: Bundle): string {
  switch (bundle) {
    case "m2":
      return `users/${userSub}/m2-snapshot.json.gz`;
    case "bookmarks":
      return `users/${userSub}/bookmarks.json.gz`;
    case "neurons":
      // M_3rd bundle. Added by add-neurons-deploy. delete.ts and backup.ts
      // walk users/<sub>/* prefix so they auto-handle this bundle.
      return `users/${userSub}/neurons-snapshot.json.gz`;
  }
}

interface PresignBody {
  bundle?: unknown;
  op?: unknown;
  schema_version?: unknown;
  /** Optional client build id (short commit sha). Purely diagnostic — logged on
   *  the throttle path so a storming client can be attributed to a version
   *  instead of inferred from its request rate. MUST stay optional: 二階 and every
   *  already-deployed bundle omit it, and this Worker serves them too. */
  build?: unknown;
}

interface ParsedPresign {
  bundle: Bundle;
  op: Op;
  // null = legacy P1 opt-in: client didn't send SV, skip enforcement.
  // number = positive integer SV, validate + sign into URL.
  schemaVersion: number | null;
  // null = client sent no build id (二階, or any bundle predating 2026-07-15).
  build: string | null;
}

// Exported for src/__tests__/presign-parse-body.test.ts only — this Worker is
// shared by neurons AND the standalone 二階 app, so the "a body field can never
// 400 a bundle that doesn't send it" contract needs a direct unit lock rather
// than trust in the comments below.
export function parseBody(body: PresignBody): ParsedPresign {
  if (typeof body.bundle !== "string" || !BUNDLES.includes(body.bundle as Bundle)) {
    throw new Error("invalid_bundle");
  }
  if (typeof body.op !== "string" || !OPS.includes(body.op as Op)) {
    throw new Error("invalid_op");
  }
  const bundle = body.bundle as Bundle;
  const op = body.op as Op;

  // schema_version: only meaningful for PUT; GET ignores entirely.
  let schemaVersion: number | null = null;
  if (op === "put" && body.schema_version !== undefined) {
    const sv = body.schema_version;
    if (typeof sv !== "number" || !Number.isInteger(sv) || !Number.isFinite(sv) || sv < 1) {
      throw new Error("invalid_schema_version");
    }
    schemaVersion = sv;
  }

  // build: optional, diagnostic only — NEVER throw on it. A malformed value from
  // some future/rogue client must not turn a working sync into a 400; sanitize
  // and move on. Length-capped and charset-restricted so it can't bloat or
  // corrupt the log line it feeds.
  let build: string | null = null;
  if (typeof body.build === "string" && /^[A-Za-z0-9._-]{1,24}$/.test(body.build)) {
    build = body.build;
  }

  return { bundle, op, schemaVersion, build };
}

/**
 * Read existing R2 blob's stored schema_version. Returns 0 if blob doesn't
 * exist OR metadata absent (legacy pre-A1 blobs). Reads both S3-style
 * `schema-version` (dash) and JSON-envelope-style `schema_version`
 * (underscore) custom metadata keys for safety against R2/SDK quirks.
 */
async function readExistingSchemaVersion(bucket: R2Bucket, key: string): Promise<number> {
  const head = await bucket.head(key);
  if (!head) return 0;
  const meta = head.customMetadata ?? {};
  const raw = meta["schema-version"] ?? meta["schema_version"];
  if (raw === undefined) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function handlePresign(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers });
  }

  // Auth
  let userSub: string;
  try {
    const token = extractBearer(request);
    const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
    userSub = user.sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unauthenticated";
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Body
  let bundle: Bundle;
  let op: Op;
  let schemaVersion: number | null;
  let build: string | null;
  try {
    const body = (await request.json()) as PresignBody;
    const parsed = parseBody(body);
    bundle = parsed.bundle;
    op = parsed.op;
    schemaVersion = parsed.schemaVersion;
    build = parsed.build;
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_body";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const key = bundleKey(userSub, bundle);

  // Server-side cost cap (add-presign-put-rate-limit): rate-limit PUT presigns
  // per (user, bundle). Combined with the short PUT presign TTL below — which
  // defeats the client's ~240s URL cache and forces a fresh presign per PUT —
  // this bounds R2 Class-A PutObject volume regardless of client bundle
  // version. It is the durable backstop for a stuck old-bundle tab we cannot
  // reach client-side (the iOS-Safari deferred-dirty visibility-flush storm).
  // Placed BEFORE the R2 HEAD so a throttled request costs no R2 op.
  if (op === "put" && env.PRESIGN_PUT_LIMITER) {
    try {
      const { success } = await env.PRESIGN_PUT_LIMITER.limit({ key: `${userSub}:${bundle}` });
      if (!success) {
        // Fires ONLY when throttling — doubles as the §0 attribution probe for
        // eliminate-cross-device-r2-412-storm (which user + bundle storms).
        // `b` (client build) added 2026-07-15: turns old-vs-new bundle
        // attribution from a rate-signature INFERENCE into a fact. null = a
        // client that predates the build tag (i.e. almost certainly a stale
        // bundle) or 二階, which never sends one.
        console.log(
          JSON.stringify({ rl: "throttled", bundle, u: userSub.slice(0, 8), b: build ?? null }),
        );
        return new Response(JSON.stringify({ error: "rate_limited", bundle }), {
          status: 429,
          headers: { ...headers, "Content-Type": "application/json", "Retry-After": "10" },
        });
      }
    } catch (err) {
      // Fail-open: a limiter hiccup must not break legitimate sync. Log + allow.
      console.error("[presign] rate-limiter error, failing open", { err: String(err) });
    }
  }

  // SV downgrade enforcement — PUT op with SV declared.
  if (op === "put" && schemaVersion !== null) {
    let existingSV: number;
    try {
      existingSV = await readExistingSchemaVersion(env.R2_PRIMARY, key);
    } catch (err) {
      // HEAD failure is unexpected. Fail closed so we don't silently bypass.
      const message = err instanceof Error ? err.message : "r2_head_failed";
      return new Response(JSON.stringify({ error: "r2_head_failed", detail: message, bundle, key }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (schemaVersion < existingSV) {
      return new Response(
        JSON.stringify({
          error: "r2_schema_downgrade_refused",
          cloud: existingSV,
          incoming: schemaVersion,
          bundle,
          key,
        }),
        {
          status: 409,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
  }

  // Presign via S3 API.
  // PUT presigns use a SHORT ttl (default 45s) deliberately: the client reuses
  // a cached presigned URL only while `expiresAt - 60_000 > now` (client.ts),
  // so any PUT ttl < 60s forces a fresh presign on every PUT — which is what
  // routes every PUT attempt back through PRESIGN_PUT_LIMITER above. GET keeps
  // the long ttl (reads are cheap Class-B and benefit from client URL caching).
  const ttlSeconds =
    op === "put"
      ? Number(env.PRESIGN_PUT_TTL_SECONDS) || 45
      : Number(env.PRESIGN_TTL_SECONDS) || 300;
  const r2Url = `${env.R2_S3_ENDPOINT}/${env.R2_BUCKET_NAME}/${key}`;

  const aws = new AwsClient({
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  // For PUT + SV signed: bake `x-amz-meta-schema-version: <N>` into SigV4
  // scope so R2 enforces "client must send exact header value at PUT time".
  // SigV4 SignedHeaders enforcement means tampered/omitted header → R2 403.
  let requiredHeaders: Record<string, string> | undefined;
  const signInit: RequestInit & { aws: { signQuery: boolean; expires: number } } = {
    method: op === "put" ? "PUT" : "GET",
    aws: {
      signQuery: true,
      // aws4fetch supports `expires` at runtime; field missing from .d.ts (v1.0.20).
      expires: ttlSeconds,
    },
  };
  if (op === "put" && schemaVersion !== null) {
    const metaHeader = { "x-amz-meta-schema-version": String(schemaVersion) };
    signInit.headers = metaHeader;
    requiredHeaders = metaHeader;
  }

  // signQuery: true puts auth in query string (presigned URL pattern).
  // expires: ttl is supported by aws4fetch runtime but missing from its
  // shipped .d.ts (as of v1.0.20). Placing X-Amz-Expires as a signed
  // *header* (the obvious alternative) makes browser PUT fail because
  // browsers don't send x-amz-expires as a request header, breaking
  // signature canonicalization. Custom `x-amz-meta-*` headers ARE sent
  // by browsers (subject to CORS preflight allowing them) so they work
  // as signed headers.
  // aws4fetch's `aws` extension is not in the official RequestInit type but
  // works at runtime — cast to silence TS while preserving inference elsewhere.
  const signed = await aws.sign(r2Url, signInit as unknown as RequestInit);

  const expiresAt = Date.now() + ttlSeconds * 1000;
  const responseBody: {
    url: string;
    expiresAt: number;
    key: string;
    requiredHeaders?: Record<string, string>;
  } = { url: signed.url, expiresAt, key };
  if (requiredHeaders) responseBody.requiredHeaders = requiredHeaders;

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
