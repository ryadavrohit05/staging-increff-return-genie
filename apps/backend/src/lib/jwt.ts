import crypto from 'node:crypto';

/**
 * Supabase access-token verifier. Supabase signs access tokens either with the
 * legacy symmetric **HS256** secret (older projects) or, for projects that have
 * enabled the newer **asymmetric JWT signing keys**, with **ES256** (and the
 * public key published at the project's JWKS endpoint). We verify locally to
 * avoid a network round-trip per request (ARCHITECTURE.md §6); for ES256 we
 * fetch + cache the JWKS once and reuse the public key.
 */
export interface SupabaseJwtClaims {
  sub: string; // auth.users.id
  email?: string;
  role?: string; // postgres role: "authenticated"
  exp?: number; // epoch seconds
  iat?: number;
  app_metadata?: {
    org_id?: string;
    role?: string; // platform role: SUPERADMIN | OWNER | ADMIN | MEMBER
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export class JwtError extends Error {}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

function decodeSegment<T>(seg: string, what: string): T {
  try {
    return JSON.parse(base64UrlDecode(seg).toString('utf8')) as T;
  } catch {
    throw new JwtError(`Invalid token ${what}`);
  }
}

function parseClaims(payloadB64: string): SupabaseJwtClaims {
  const claims = decodeSegment<SupabaseJwtClaims>(payloadB64, 'payload');
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    throw new JwtError('Token expired');
  }
  if (!claims.sub) throw new JwtError('Token missing subject');
  return claims;
}

// ── JWKS cache (for ES256/RS256 asymmetric signing keys) ──────────────────────
const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { url: string; keys: Map<string, crypto.KeyObject>; fetchedAt: number } | null =
  null;

async function fetchJwks(url: string): Promise<Map<string, crypto.KeyObject>> {
  const res = await fetch(url);
  if (!res.ok) throw new JwtError(`JWKS fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  const keys = new Map<string, crypto.KeyObject>();
  for (const jwk of body.keys ?? []) {
    const kid = jwk.kid as string | undefined;
    if (!kid) continue;
    try {
      keys.set(kid, crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' }));
    } catch {
      // Skip keys we can't materialise (unsupported curve/type).
    }
  }
  return keys;
}

async function getSigningKey(url: string, kid: string | undefined): Promise<crypto.KeyObject> {
  const fresh =
    jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!fresh) {
    jwksCache = { url, keys: await fetchJwks(url), fetchedAt: Date.now() };
  }
  let key = kid ? jwksCache!.keys.get(kid) : [...jwksCache!.keys.values()][0];
  if (!key && fresh) {
    // Possible key rotation — force one refresh before giving up.
    jwksCache = { url, keys: await fetchJwks(url), fetchedAt: Date.now() };
    key = kid ? jwksCache.keys.get(kid) : [...jwksCache.keys.values()][0];
  }
  if (!key) throw new JwtError('No matching JWKS signing key');
  return key;
}

export interface VerifyOptions {
  /** Legacy symmetric secret (Project Settings → API → JWT Secret). */
  hmacSecret?: string;
  /** JWKS endpoint for asymmetric keys, e.g. `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
  jwksUrl?: string;
}

/**
 * Verify a Supabase access token (HS256 or ES256/RS256) and return its claims.
 * Throws `JwtError` on any structural, signature, or expiry failure.
 */
export async function verifySupabaseJwt(
  token: string,
  opts: VerifyOptions,
): Promise<SupabaseJwtClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeSegment<JwtHeader>(headerB64, 'header');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  if (header.alg === 'HS256') {
    if (!opts.hmacSecret) throw new JwtError('No HMAC secret configured');
    const expected = crypto.createHmac('sha256', opts.hmacSecret).update(signingInput).digest();
    if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
      throw new JwtError('Invalid signature');
    }
  } else if (header.alg === 'ES256' || header.alg === 'RS256') {
    if (!opts.jwksUrl) throw new JwtError('No JWKS URL configured');
    const key = await getSigningKey(opts.jwksUrl, header.kid);
    // ES256 JWT signatures are raw r||s (IEEE-P1363); RS256 are PKCS#1 v1.5.
    const verifyKey =
      header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' as const } : key;
    const ok = crypto.verify('sha256', Buffer.from(signingInput), verifyKey, signature);
    if (!ok) throw new JwtError('Invalid signature');
  } else {
    throw new JwtError(`Unsupported alg: ${header.alg}`);
  }

  return parseClaims(payloadB64);
}

/**
 * Minimal HS256-only verifier. Retained for callers/tests that only deal with the
 * legacy symmetric secret. Prefer {@link verifySupabaseJwt} for live requests.
 */
export function verifyHs256(token: string, secret: string): SupabaseJwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeSegment<JwtHeader>(headerB64, 'header');
  if (header.alg !== 'HS256') throw new JwtError(`Unsupported alg: ${header.alg}`);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const provided = base64UrlDecode(signatureB64);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new JwtError('Invalid signature');
  }

  return parseClaims(payloadB64);
}
