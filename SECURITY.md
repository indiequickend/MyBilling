# Security

This documents the Phase 14 security-hardening pass (see `build_phases.md` → Phase 14) against the
checklist in `project_spec.md` → Security requirements / `CLAUDE.md` → Security rules. It's a snapshot of
what was reviewed and why a given control looks the way it does — re-verify anything here that a later
change touches (a new public route, a new Server Action file, a new external script).

## CSRF

Cookie-authenticated mutations happen two ways in this app, with two different protections:

- **Server Actions** (the vast majority of mutations — every `app/**/actions.ts` file) rely on Next.js
  15's built-in Server Action origin check. Next compares the request's `Origin` header against its own
  `x-forwarded-host`/host on every Server Action POST and aborts before invoking the action if they don't
  match. Verified directly against a running dev server (2026-07-31): a forged POST to `/login` with
  `Origin: https://evil.example.com` and a `Next-Action` header was rejected —
  `"x-forwarded-host header ... does not match origin header ... Aborting the action"` → 500 `Invalid
  Server Actions request`. The identical request with a matching `Origin` fell through to normal
  action-resolution (a 200, failing only because the fake action ID doesn't exist) — confirming the
  origin check, not something else, is what blocks the cross-origin attempt. No additional CSRF code is
  needed for Server Actions.
- **API route handlers** that mutate state (`app/api/**/route.ts`) don't get this protection automatically
  and use the app's own explicit double-submit-cookie utility, `lib/auth/csrf.ts`
  (`ensureCsrfCookie`/`requireCsrf`, timing-safe compared via `tokensEqual`). Currently wired into the 8
  routes that need it: `users`, `users/[membershipId]`, `roles`, `roles/[roleId]`, `auth/2fa/{verify,disable,setup}`,
  `auth/sessions`. Every other mutating route handler either doesn't need it (`v1/*` — bearer API-key
  auth, not cookies; `webhooks/razorpay` — HMAC-signature verified; `pay/[token]/gateway-order` — gated by
  the payment link's own signed token) or should be added to this list if it's ever changed to accept
  cookie-authenticated mutations.

**Rule for new code**: a new Server Action needs nothing extra. A new mutating API route handler that
reads the session cookie needs `requireCsrf(request)` — copy the pattern from any of the 8 routes above.

## CSP / security headers

`middleware.ts` sets a strict CSP (nonce-based `script-src`, no `unsafe-inline` outside dev, `frame-ancestors
'none'`, `base-uri 'self'`, `form-action 'self'`) plus `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and HSTS, on every
response except static assets. Reviewed against what the app actually loads today:

- `img-src` allows `res.cloudinary.com` (logos/signatures/attachments) — matches actual usage.
- `font-src` allows `fonts.gstatic.com` (next/font/google's occasional dev-mode CDN reference) — matches.
- `connect-src 'self'` — no client-side calls to a third-party API exist today (no client-side Razorpay
  Checkout script; Razorpay order creation happens server-side in `lib/paymentGateway/razorpay.ts`).
- No inline `<script>` tags outside what Next.js itself injects (covered by the nonce).

**Nothing needs to change right now.** Re-check this policy when either of these land:

- **Phase 11** (Online Store / Business Link / Customer Portal) — a public storefront may need new
  `img-src`/`connect-src` allowances depending on what it embeds.
- **Client-side Razorpay Checkout**, if the payment-link flow ever moves from server-side order creation
  to the Razorpay Checkout.js widget — that script needs an explicit `script-src`/`connect-src` exception
  for `checkout.razorpay.com`/`api.razorpay.com`, it will not work under the current policy.

## Rate limiting

`lib/auth/rateLimit.ts` — in-memory sliding-window limiter, single-instance by design (no Redis; see its
own doc comment). Coverage as of this pass:

| Route | Key | Limit |
|---|---|---|
| Login | `login` | 10 / 60s |
| 2FA verify | `2fa` | 10 / 60s |
| Signup | `setup` | 5 / 60s |
| Forgot password | `forgot-password` | 5 / 60s |
| Reset password | `reset-password` | 10 / 60s |
| Resend verification | `resend-verification` | 5 / 60s |
| Accept invite | `accept-invite` | 10 / 60s |
| Invite a user | `invite-user` | 20 / 60s |
| Payment link page (public) | `pay-link` | 30 / 60s |
| Payment link gateway-order (public API) | `pay-link-gateway-order` | 10 / 60s |
| `v1/*` API | `apiv1:<apiKeyId>` | 120 / 60s per key |

**Intentionally not rate-limited**: `app/api/webhooks/razorpay/route.ts`. It's authenticated by HMAC
signature verification against the Razorpay-signed payload, not by anything an attacker could brute-force,
and Razorpay's own retry behavior could legitimately produce short bursts — a rate limit here would risk
dropping real webhook deliveries for no real security benefit.

Every public/unauthenticated route that exists today (`/pay/[token]` and its gateway-order API) is
covered. Phase 11's storefront/portal routes don't exist yet — rate-limit them using the same
`checkRateLimit`/`rateLimitKeyFromHeaders` pattern when they're built.

## Signed, time-boxed tokens on public routes

The one public-without-session surface that exists today, Payment Links, follows the correct pattern:
`lib/db/models/PaymentLink.ts` stores only `tokenHash` (HMAC-SHA256 via `lib/auth/tokens.ts`), never the
raw token; `expiresAt`/`revokedAt` enforce time-boxing; the raw token only ever lives in the URL the
business shares. This is the pattern to reuse for Phase 11's shareable ledger links / storefront links
when they're built — there is nothing else to retrofit today.

## Sensitive-field masking + audit-logged reveal

Bank account numbers, PAN, and GSTIN are masked by default with an explicit, audit-logged reveal
(`lib/utils/mask.ts`, `components/ui/RevealField.tsx`, `recordAuditLog` with action
`sensitive_field.revealed`) in the places where they're browsed incidentally — the Customers and Vendors
list pages' GSTIN column.

**Deliberately not masked**, because the field's entire purpose there is to be read in full by its
intended audience — masking would break the feature, not secure it:

- `app/pay/[token]/page.tsx` — the public payment page shows a business's own bank account number/IFSC/UPI
  ID in full so the payer can actually complete a bank transfer. The security boundary here is the signed,
  time-boxed token gating the page, not the account number itself (same logic as printing your own bank
  details on an invoice for NEFT payment — standard practice, not a leak).
- Document PDFs (Invoice, Purchase, Quotation, etc.) — GSTIN on a tax invoice is a legal disclosure
  requirement, not incidental exposure; it's also independently verifiable on the government GST portal.
- The Bank Account edit form and Company Settings (GSTIN/PAN) — these are edit forms already gated behind
  `settings.manage_banking`/`settings.manage_company`; masking a field you're actively editing under a
  permission you already hold adds friction without a security benefit.

## Dependency scanning

`pnpm run audit` (`pnpm audit --audit-level=high`) runs in CI on every push/PR to `main`
(`.github/workflows/security.yml`). No container image exists for this app (CLAUDE.md: plain Node
process, no Docker) — container scanning doesn't apply.

**Known, accepted findings (2026-07-31)** — 13 high-severity advisories, all against Next.js 15.3.9 or
its own bundled `sharp`/`postcss`, are explicitly ignored via `pnpm-workspace.yaml`'s
`auditConfig.ignoreGhsas` (visible in every audit run's output as "N ignored," not silently hidden):

- 11 Next.js CVEs (DoS via Server Components/Cache Components/Server Actions, SSRF via WebSocket
  upgrades/rewrites/custom servers, middleware/proxy bypass in the App Router and Pages Router i18n) —
  all fixed in later 15.5.x patch releases (up to 15.5.22 as of this writing).
- 1 `sharp` CVE (inherited libvips issues) and 2 `postcss` CVEs (source-map path traversal/file
  disclosure) — both bundled inside `next` itself, so they'd resolve automatically with the same upgrade.

**This is a deliberate exception, not an oversight**: CLAUDE.md pins Next.js to the 15.3.x line and React
to 19.0.x after a prior 16.x prerender bug and a React 19.2.x/Next 15.3.9 RSC-payload incompatibility —
upgrading `next` is a stack decision the project owner wants to make separately and deliberately, not as
a side effect of a security-audit pass. Revisit this exception when that upgrade happens (moving to any
15.5.x patch would very likely clear the Next.js/sharp/postcss items above without violating the pin) —
until then, `pnpm audit`/CI stay green without hiding the gap.

One unrelated finding — `brace-expansion` (DoS via unbounded expansion, pulled in transitively through
`exceljs`'s zip/glob dependency chain, unrelated to the Next.js pin) — was fixed outright via a
`pnpm-workspace.yaml` `overrides` entry forcing `>=5.0.8`, no exception needed.

## Immutable audit log

`lib/db/models/AuditLog.ts` — create-only, no update/delete query helper exists. Written from: login
success/failure (fanned out to every business the user belongs to, since auth isn't business-scoped),
role create/update/delete, membership invite/role-change/deactivate/reactivate, payment voids, every
soft-delete/restore across masters and documents, and sensitive-field reveals. Viewable at Settings →
Audit Log, gated by the new `settings.view_audit_log` permission (backfilled onto existing roles that
already had `manage_roles`/`manage_users` — see `scripts/backfillAuditLogPermission.ts`).

## Backup / restore drill

MongoDB Atlas owns scheduled backups (CLAUDE.md — no self-managed backup sidecar) — there's no
self-managed backup code to write, only a drill to run and document. This requires Atlas console/API
access this environment doesn't have, so it's a runbook for whoever holds that access to execute, not
something performable from here.

**Runbook** (run against the dev/test cluster, never production):

1. In Atlas → your project → **Backup** tab, confirm Continuous/Cloud Backup is enabled on the cluster
   this app's `MONGODB_URI` points at, and that a scheduled snapshot exists (Atlas takes these
   automatically once backup is enabled — no app-side config needed).
2. Pick a recent snapshot → **Restore** → **Restore to a new cluster** (not "restore in place" — an
   in-place restore is destructive and not what a drill should do). Name it something like
   `mybilling-restore-drill` in the same project.
3. Once the new cluster is up, grab its connection string, temporarily point a local `.env` copy's
   `MONGODB_URI` at it, and run `pnpm dev`.
4. Verify: log in with a known user, confirm a business/customer/invoice you recognize from the source
   cluster is present and correct, confirm `pnpm test`'s tenant-isolation suite still passes against it.
5. Record here: the date, which snapshot was restored, how long the restore took, and confirmation it
   booted and served correct data.
6. **Delete the scratch cluster** when done — it's a live, billed Atlas cluster with a full copy of the
   data, not something to leave running.

_Last performed: not yet run — pending someone with Atlas console access completing the steps above._
