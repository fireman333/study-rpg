/**
 * CORS helpers — share allowed-origin policy across endpoints.
 *
 * The R2 bucket itself also has CORS rules (set via wrangler r2 bucket cors set);
 * this is the Worker-layer CORS for our auth endpoints. R2 enforces its own.
 */

export function corsHeaders(origin: string, allowed: boolean): Record<string, string> {
  if (!allowed) {
    // Don't echo back unknown origins — browser will reject the response.
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    // PUT is required by the shoutout compose/edit endpoint
    // (shoutout.ts routes `method === "PUT"` → handlePut). It was missing
    // here, so the browser preflight blocked every compose request even
    // though the Worker accepted PUT server-side (curl PUT → 401, not 405).
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    // `If-None-Match` is sent by the proxy-read endpoint (GET /r2/read) for
    // conditional pulls (route-r2-reads-through-worker-proxy); without it the
    // browser preflight would strip the header. Additive — other endpoints
    // simply never send it.
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match",
    // Without this, a cross-origin client reads Retry-After as null on our 429s
    // and falls back to its own base cooldown. Exposing it lets the presign
    // rate-limit response actually steer the client. Note the client takes
    // max(hint, its own exponential floor), so exposing a small hint (we send
    // "10") can only ever make it back off MORE, never less — no regression.
    // `ETag` is exposed so the proxy-read client can read it off 200/304
    // responses and round-trip it as the next `If-None-Match`
    // (route-r2-reads-through-worker-proxy). Additive.
    "Access-Control-Expose-Headers": "Retry-After, ETag",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin",
  };
}

export function preflightResponse(origin: string, allowed: boolean): Response {
  return new Response(null, {
    status: allowed ? 204 : 403,
    headers: corsHeaders(origin, allowed),
  });
}
