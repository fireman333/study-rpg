/**
 * POST /delete-account and POST /reset
 *
 * Default (no body): list all R2 objects under `users/<sub>/` and delete them.
 * Optional body `{ "bundle": "m2" | "bookmarks" | "neurons" }` scopes the
 * delete to that single bundle's object (add-worker-bundle-scoped-delete) —
 * resetting one app must not destroy a sibling app's save under the same
 * account. An unknown bundle value is a 400 and deletes NOTHING (fail-closed:
 * a typo must never escalate to a full-account wipe).
 *
 * The semantic difference (user gets signed out vs not) is handled CLIENT-SIDE:
 * - /delete-account: client also calls supabase.rpc('delete_my_data') + signOut
 * - /reset:          client keeps the session, only data is wiped
 *
 * Worker holds NO admin / service-role keys — it only manages R2 storage.
 */

import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";
import { BUNDLES, bundleKey, type Bundle } from "./presign";

async function deleteAllUserObjects(bucket: R2Bucket, userSub: string): Promise<{ deleted: number }> {
  const prefix = `users/${userSub}/`;
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map(obj => obj.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return { deleted };
}

/**
 * Parse the optional `{ bundle }` body. Returns:
 * - { bundle }  — valid scoped request
 * - { bundle: null } — no body / not JSON / no bundle field → legacy full wipe
 * - 'invalid'  — bundle field present but not a known name → 400, delete nothing
 */
async function parseBundleScope(request: Request): Promise<{ bundle: Bundle | null } | "invalid"> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { bundle: null }; // no/invalid JSON body — legacy clients
  }
  if (!body || typeof body !== "object" || !("bundle" in body)) {
    return { bundle: null };
  }
  const bundle = (body as { bundle: unknown }).bundle;
  if (typeof bundle !== "string" || !BUNDLES.includes(bundle as Bundle)) {
    return "invalid";
  }
  return { bundle: bundle as Bundle };
}

export async function handleDeleteOrReset(
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

  // Optional bundle scope (add-worker-bundle-scoped-delete)
  const scope = await parseBundleScope(request);
  if (scope === "invalid") {
    return new Response(JSON.stringify({ error: "invalid_bundle" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Wipe
  let deleted: number;
  if (scope.bundle) {
    await env.R2_PRIMARY.delete(bundleKey(userSub, scope.bundle));
    deleted = 1;
  } else {
    deleted = (await deleteAllUserObjects(env.R2_PRIMARY, userSub)).deleted;
  }

  return new Response(
    JSON.stringify({ r2: "ok", deleted, user: userSub, scope: scope.bundle ?? "all" }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}
