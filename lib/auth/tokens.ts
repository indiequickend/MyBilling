import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env and set a random secret " +
        "(e.g. `openssl rand -base64 48`).",
    );
  }
  return secret;
}

/** A high-entropy opaque token suitable for cookies, invite links, etc. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * HMAC-SHA256 of a token, hex-encoded, for storage. We store this instead of the
 * raw token so a database read (backup leak, misconfigured access, etc.) alone
 * can't be used to impersonate a session/invite/reset link — the attacker would
 * also need SESSION_SECRET.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", requireSessionSecret()).update(token).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
