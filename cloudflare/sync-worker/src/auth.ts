/**
 * Supabase JWT verification via JWKS.
 *
 * Caches JWKS in module scope for 1 hour. Cold start refetches; cache miss
 * during a verify also refetches (auto-recovery from key rotation).
 *
 * Returns the verified `sub` claim (Supabase user UUID), or throws.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJWKSUrl = "";
let cachedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

function getJWKS(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const now = Date.now();
  if (cachedJWKS && cachedJWKSUrl === jwksUrl && now - cachedAt < JWKS_TTL_MS) {
    return cachedJWKS;
  }
  cachedJWKS = createRemoteJWKSet(new URL(jwksUrl));
  cachedJWKSUrl = jwksUrl;
  cachedAt = now;
  return cachedJWKS;
}

export interface VerifiedUser {
  sub: string;
  email?: string;
}

export async function verifyJWT(token: string, jwksUrl: string, projectRef: string): Promise<VerifiedUser> {
  const jwks = getJWKS(jwksUrl);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
  });
  return extractUser(payload);
}

function extractUser(payload: JWTPayload): VerifiedUser {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("jwt_missing_sub");
  }
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

/**
 * Extract bearer token from Authorization header, or throw `unauthenticated`.
 */
export function extractBearer(request: Request): string {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new Error("unauthenticated");
  }
  const token = auth.slice("Bearer ".length).trim();
  if (token.length === 0) {
    throw new Error("unauthenticated");
  }
  return token;
}
