import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Baseline security headers applied to every response. Kept deliberately
 * strict; loosen only for a specific, documented reason (e.g. an embed
 * that needs a relaxed frame-ancestors policy).
 *
 * Uses a per-request nonce for script-src rather than 'unsafe-inline':
 * Next.js's App Router injects inline <script> tags for RSC/hydration data on
 * every page, so a CSP without an escape hatch for them breaks ALL client
 * component interactivity (forms, buttons, useActionState/useTransition)
 * app-wide — it only silently "works" for pages nobody actually clicks
 * anything on. Next.js auto-detects a `nonce-` token in this response's own
 * Content-Security-Policy header and applies it to the scripts it generates,
 * so no changes are needed elsewhere (see the request header below, which
 * only matters for hand-written <script nonce={...}> tags, of which this
 * project currently has none).
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  // Dev mode additionally needs 'unsafe-eval' for hot-reload/HMR; never allow it in production.
  const scriptSrc = isDev ? `'self' 'nonce-${nonce}' 'unsafe-eval'` : `'self' 'nonce-${nonce}'`;

  const csp = [
    "default-src 'self'",
    "img-src 'self' data: https://res.cloudinary.com",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    // next/font/google self-hosts the actual font files at build time, but
    // still references Google's font CDN in some cases (seen in dev mode) —
    // allow it explicitly rather than let fonts silently fail to load.
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
