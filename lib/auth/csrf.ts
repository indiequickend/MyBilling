import { generateToken, tokensEqual } from "@/lib/auth/tokens";
import { getCsrfCookie, setCsrfCookie } from "@/lib/auth/cookies";

const CSRF_HEADER = "x-csrf-token";
const CSRF_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the session cookie's default TTL

export class CsrfError extends Error {
  constructor() {
    super("CSRF token missing or invalid");
    this.name = "CsrfError";
  }
}

/** Issues (or reuses) the readable CSRF cookie for the current response. */
export async function ensureCsrfCookie(): Promise<string> {
  const existing = await getCsrfCookie();
  if (existing) return existing;
  const token = generateToken();
  await setCsrfCookie(token, new Date(Date.now() + CSRF_TTL_MS));
  return token;
}

/**
 * Double-submit check: the client must echo the csrf cookie's value back in a
 * header, which only same-origin JS (never a cross-site form/fetch) can read.
 * Belt-and-suspenders on top of the session cookie's SameSite=Lax.
 */
export async function requireCsrf(request: Request): Promise<void> {
  const cookieValue = await getCsrfCookie();
  const headerValue = request.headers.get(CSRF_HEADER);
  if (!cookieValue || !headerValue || !tokensEqual(cookieValue, headerValue)) {
    throw new CsrfError();
  }
}

export { CSRF_HEADER };
