import { cookies } from "next/headers";
import { hashToken, tokensEqual } from "@/lib/auth/tokens";

/**
 * Short-lived state for the "password OK, now enter your 2FA code" step. Kept
 * as a small self-contained signed cookie (userId + expiry + HMAC) rather than
 * a new DB collection — it only needs to survive a couple of minutes and
 * carries no secret beyond a user id.
 */

const COOKIE_NAME = "pending_2fa";
const TTL_MS = 5 * 60 * 1000;

export async function setPendingLogin(userId: string): Promise<void> {
  const expiresAt = Date.now() + TTL_MS;
  const signature = hashToken(`${userId}.${expiresAt}`);
  const value = `${userId}.${expiresAt}.${signature}`;

  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function getPendingLoginUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [userId, expiresAtStr, signature] = raw.split(".");
  if (!userId || !expiresAtStr || !signature) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = hashToken(`${userId}.${expiresAtStr}`);
  if (!tokensEqual(expected, signature)) return null;

  return userId;
}

export async function clearPendingLogin(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
