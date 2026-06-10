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
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
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
