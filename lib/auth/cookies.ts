import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf";

const isProduction = process.env.NODE_ENV === "production";

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Non-httpOnly by design — the CSRF double-submit pattern needs client JS to read it. */
export async function setCsrfCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCsrfCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CSRF_COOKIE)?.value;
}

export async function clearCsrfCookie() {
  const store = await cookies();
  store.delete(CSRF_COOKIE);
}
