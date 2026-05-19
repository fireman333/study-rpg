/**
 * POST /presign — returns a presigned R2 URL scoped to the JWT-bound user.
 *
 * Request body: { bundle: 'm1' | 'm2' | 'bookmarks', op: 'put' | 'get' }
 * Response:     { url: string, expiresAt: number }
 *
 * The R2 key is ALWAYS `users/<jwt.sub>/<bundle>.json.gz` — body fields like
 * user_id are ignored to prevent forging across tenancies.
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

type Bundle = "m1" | "m2" | "bookmarks";
type Op = "put" | "get";

const BUNDLES: ReadonlyArray<Bundle> = ["m1", "m2", "bookmarks"];
const OPS: ReadonlyArray<Op> = ["put", "get"];

function bundleKey(userSub: string, bundle: Bundle): string {
  switch (bundle) {
    case "m1":
      return `users/${userSub}/m1-snapshot.json.gz`;
    case "m2":
      return `users/${userSub}/m2-snapshot.json.gz`;
    case "bookmarks":
      return `users/${userSub}/bookmarks.json.gz`;
  }
}

interface PresignBody {
  bundle?: unknown;
  op?: unknown;
}

function parseBody(body: PresignBody): { bundle: Bundle; op: Op } {
  if (typeof body.bundle !== "string" || !BUNDLES.includes(body.bundle as Bundle)) {
    throw new Error("invalid_bundle");
  }
  if (typeof body.op !== "string" || !OPS.includes(body.op as Op)) {
    throw new Error("invalid_op");
  }
  return { bundle: body.bundle as Bundle, op: body.op as Op };
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
  try {
    const body = (await request.json()) as PresignBody;
    const parsed = parseBody(body);
    bundle = parsed.bundle;
    op = parsed.op;
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_body";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Presign via S3 API
  const ttlSeconds = Number(env.PRESIGN_TTL_SECONDS) || 300;
  const key = bundleKey(userSub, bundle);
  const r2Url = `${env.R2_S3_ENDPOINT}/${env.R2_BUCKET_NAME}/${key}`;

  const aws = new AwsClient({
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  // signQuery: true puts auth in query string (presigned URL pattern).
  // expires: ttl is supported by aws4fetch runtime but missing from its
  // shipped .d.ts (as of v1.0.20). Placing X-Amz-Expires as a signed
  // *header* (the obvious alternative) makes browser PUT fail because
  // browsers don't send x-amz-expires as a request header, breaking
  // signature canonicalization.
  const signed = await aws.sign(r2Url, {
    method: op === "put" ? "PUT" : "GET",
    aws: {
      signQuery: true,
      // @ts-expect-error — aws4fetch supports `expires` at runtime
      expires: ttlSeconds,
    },
  });

  const expiresAt = Date.now() + ttlSeconds * 1000;
  return new Response(
    JSON.stringify({ url: signed.url, expiresAt, key }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}
