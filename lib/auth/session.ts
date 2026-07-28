import { headers } from "next/headers";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { getSessionCookie, setSessionCookie, clearSessionCookie } from "@/lib/auth/cookies";
import { ensureCsrfCookie } from "@/lib/auth/csrf";
import {
  createSessionRecord,
  findActiveSessionByTokenHash,
  touchSession,
  revokeSession as revokeSessionRecord,
  revokeAllSessionsForUser,
  listActiveSessionsForUser,
} from "@/lib/db/queries/sessions";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const TOUCH_THRESHOLD_MS = 60 * 60 * 1000; // only re-extend at most once per hour of activity

async function requestMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent") ?? undefined,
    // Trust only what a same-origin deployment behind a reverse proxy sets; this is
    // best-effort metadata for the user's own "active sessions" list, not a security boundary.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  };
}

export async function createSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const meta = await requestMeta();

  const record = await createSessionRecord({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ...meta,
  });

  await setSessionCookie(token, expiresAt);
  // Every authenticated session gets a CSRF cookie up front, so client
  // components can call mutating API routes without a separate round-trip.
  await ensureCsrfCookie();
  return record;
}

/** Returns the active Session document for the current request's cookie, or null. */
export async function getSessionFromCookie() {
  const token = await getSessionCookie();
  if (!token) return null;

  const session = await findActiveSessionByTokenHash(hashToken(token));
  if (!session) return null;

  const idleMs = Date.now() - session.lastActiveAt.getTime();
  if (idleMs > TOUCH_THRESHOLD_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await touchSession(String(session._id), newExpiresAt);
  }

  return session;
}

export async function revokeCurrentSession() {
  const token = await getSessionCookie();
  if (token) {
    const session = await findActiveSessionByTokenHash(hashToken(token));
    if (session) {
      await revokeSessionRecord(String(session._id), String(session.userId));
    }
  }
  await clearSessionCookie();
}

export async function revokeSessionForUser(sessionId: string, userId: string) {
  return revokeSessionRecord(sessionId, userId);
}

export async function revokeAllSessions(userId: string) {
  return revokeAllSessionsForUser(userId);
}

export async function listSessionsForUser(userId: string) {
  return listActiveSessionsForUser(userId);
}
