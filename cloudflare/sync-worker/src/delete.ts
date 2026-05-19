/**
 * POST /delete-account and POST /reset
 *
 * Both endpoints list all R2 objects under `users/<sub>/` and delete them.
 * The semantic difference (user gets signed out vs not) is handled CLIENT-SIDE:
 * - /delete-account: client also calls supabase.rpc('delete_my_data') + signOut
 * - /reset:          client keeps the session, only data is wiped
 *
 * Worker holds NO admin / service-role keys — it only manages R2 storage.
 */

import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

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

  // Wipe
  const result = await deleteAllUserObjects(env.R2_PRIMARY, userSub);

  return new Response(
    JSON.stringify({ r2: "ok", deleted: result.deleted, user: userSub }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}
