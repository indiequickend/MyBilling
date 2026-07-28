# Build Phases

Ordered build plan for the self-hosted billing platform described in `project_spec.md`, following the
conventions in `CLAUDE.md`. Build phases **in order** — each assumes the collections/auth/RBAC from
earlier phases already exist. Each phase ends with a manual verification checklist; treat it as the
definition of done, not a suggestion.

---

## Phase 0 — Scaffolding & baseline

**Goal**: an empty but runnable, secure-by-default skeleton. No Docker/containers anywhere in this
project — the app is a plain Node.js/Next.js process, and the database is a remote **MongoDB Atlas**
cluster (connection details supplied by the user), not a local/self-hosted Mongo instance.

- `pnpm create next-app` (App Router, TypeScript, Tailwind, ESLint).
- `lib/db/connect.ts`: a Mongoose connection helper that reads `MONGODB_URI` (the Atlas connection
  string) and fails fast at startup if it's missing or unreachable, rather than silently retrying or
  falling back to a default. Confirm the Atlas cluster's network access list permits the environment
  this runs in (local IP for dev, host/provider IP or `0.0.0.0/0`-with-strong-auth for deployed
  environments — document whatever the user's Atlas project actually requires).
- Cloudinary config: env vars (`CLOUDINARY_URL` or key/secret/cloud name), a minimal `lib/storage/`
  adapter with `upload()`/`delete()`/`getUrl()`.
- `.env.example` with every variable the app will need (`MONGODB_URI`, session secret, Cloudinary, SMTP —
  add to this file as later phases introduce new secrets). `.env` (with the real Atlas URI) is gitignored
  and never committed.
- Lint/format/test tooling: ESLint, Prettier, Vitest, Playwright installed and configured with a smoke
  test. Tests run against a separate Atlas database/cluster (or a `mongodb-memory-server` for pure unit
  tests) — never against the production database.
- Security baseline: security headers middleware (CSP, HSTS, X-Frame-Options, Referrer-Policy), cookie
  defaults (`httpOnly`, `Secure`, `SameSite=Lax`).

**Verify**: `pnpm dev` connects to the Atlas cluster and serves a blank home page; `pnpm test` runs the
smoke test green against the test database; a request without `MONGODB_URI` set fails loudly at startup,
not at first query; confirm `.env` is listed in `.gitignore` before any secret is ever written to it.

---

## Phase 1 — Auth + Business/Membership/Role foundation

**Collections**: `User`, `Session`, `Business`, `Membership`, `Role`.

- Signup (create User + first Business + owner Membership with an "Admin" Role template) and login
  (email+password, argon2id verify) flows.
- Session issuance: opaque token in an httpOnly cookie, `Session` document with `expiresAt`; a
  `getSession()` helper for Server Components/Route Handlers.
- Optional 2FA: TOTP enrollment/verification (SMS OTP adapter interface defined but no provider wired).
- `lib/rbac/`: permission definitions (per module: view/create/edit/delete/export, plus a few
  module-specific actions like `settings.manage_users`), the `can(membership, permission)` check, and at
  least the "Admin" system role template with everything granted.
- Account-lockout/backoff on repeated failed logins; rate limiting on `/api/auth/*`.
- User Profile page: name/email/phone edit, active-sessions list with revoke, account
  reset/delete-with-grace-period.
- All Users/Roles settings pages: member list with role assignment (activate/deactivate, **no seat
  limit**), Roles & Permissions page (list roles, "Add New Role" — duplicate a template or start from
  scratch with the full permission matrix UI).

**Verify**: can sign up, log in, log out, revoke a session from another tab and confirm it's rejected;
a second Business can be created and switched between without leaking the first business's data; a
non-admin role with `invoices.view` only gets a 403 on `invoices.create`; a test asserts no query in
`lib/db/queries/` is reachable without a `businessId` filter.

---

## Phase 2 — Company settings + core masters

**Collections**: extend `Business` (custom field defs, addresses), `Customer`, `Vendor`, `PartyGroup`,
`Product`, `ProductCategory`, `ProductGroup`, `PriceList`, `Warehouse`.

- Company Details settings page (logo via Cloudinary, GSTIN "Fetch Details" using the public GST
  taxpayer lookup — read-only, no filing action — business type, custom fields, billing/shipping
  addresses).
- Customers & Vendors: list (search, groups, soft-delete "Deleted" tab), create/edit, detail view shell
  (Ledger/Transactions/Bill-wise/Activity tabs — Ledger data populates once Phase 3+ documents exist).
- Products & Services: Items CRUD (product vs service, HSN/SAC, variants, barcode, images), Categories,
  Groups, Price Lists.
- Warehouses CRUD (Inventory doesn't have real stock movements until Phase 6, but the location list
  exists here so Phase 3 can reference a default warehouse).
- Preferences settings: Document tab, Products & Inventory tab (defaults consumed starting Phase 3).

**Verify**: create a customer, a vendor, and a handful of products with variants; soft-delete one and
confirm it moves to "Deleted" and out of the main list, and that its data isn't hard-deleted; GSTIN
fetch-details populates the read-only public fields without requiring any paid credential.

---

## Phase 3 — Core Sales documents (Invoices)

**Collections**: `Invoice`, `Signature`, `NoteTermTemplate`, `BankAccount`, `Attachment`.

- Invoice create/edit: customer picker, dates, per-business custom header fields (schema-driven, not
  hardcoded — this is what lets a travel agency add "Journey Start Date" without a code change), line
  items with product search/barcode/discount/tax, document-level discount and round-off (from
  Preferences defaults), terms/notes (from templates), signature selection, bank account selection,
  file attachments, Save as Draft / Save & Print / Save.
- Server-side document numbering (transactional, gap-safe) per `CLAUDE.md` rules.
- Inline payment recording at invoice save time (single or split across bank accounts) — creates
  `Payment` records (collection formalized in Phase 7, but the minimal shape is needed here).
- PDF generation (`lib/pdf/`): at least one invoice template rendered server-side to PDF/print view.
- Signatures and Notes & Terms settings pages (CRUD, default/active flags).
- Banks settings page: bank/cash/personal account CRUD, UPI ID field (QR rendering can land with PDF
  templates), transfer-funds between accounts.
- Invoice list: All/Pending/Paid/Cancelled/Drafts tabs, search, date range, totals footer.

**Verify**: create an invoice with a custom header field, record a split payment across two accounts,
confirm the customer's ledger balance updates, download a PDF that includes the correct bank/UPI details
and signature; confirm invoice numbers are sequential with no gaps under concurrent creation (a basic
race test).

---

## Phase 4 — Purchases + Expenses

**Collections**: `Purchase`, `PurchaseOrder`, `DebitNote`, `Expense`, `IndirectIncome`, expense
categories (embedded or a small `ExpenseCategory` collection).

- Purchases mirror Invoices (vendor-side), Purchase Orders convertible to Purchases, Debit Notes mirror
  Credit Notes (built in Phase 5).
- Expenses: category management, create/edit, bulk upload via spreadsheet — **synchronous** import
  (validate + insert in the request, with a sane row-count ceiling documented, not a queued job).
  Indirect Income mirrors Expenses for non-sales income.

**Verify**: convert a Purchase Order into a Purchase and confirm line items carry over; bulk-upload a
CSV of expenses and confirm row-level validation errors are reported back without partial silent
failures.

---

## Phase 5 — Quotations+ suite and Credit/Debit notes

**Collections**: `Quotation`, `SalesOrder`, `ProformaInvoice`, `CreditNote` (Debit Note already in
Phase 4).

- Quotations (Open/Closed/Partial/Cancelled), convertible to Invoice or Sales Order.
- Sales Orders.
- Pro Forma Invoices (same custom-header-field mechanism as Invoices).
- Credit Notes linked to an original Invoice, adjusting customer balance.
- Document conversion utility (shared by Quotation→Invoice, PO→Purchase, etc.) — a generic
  "clone document as another type" function in `lib/db/queries/`, not copy-pasted per pair.

**Verify**: convert a Quotation to an Invoice and confirm all line items, discounts, and custom fields
carry over unchanged; issue a Credit Note against a paid Invoice and confirm the customer's ledger
reflects the reduction.

---

## Phase 6 — Inventory

**Collections**: `StockLedgerEntry`, extend `Product` with batch/serial config.

- Stock In/Out actions (manual), plus automatic ledger entries from Invoice/Credit Note/Purchase/Debit
  Note creation (decrement/increment stock tied to the document).
- Timeline view (chronological stock ledger, filterable by product/warehouse).
- Dashboard tiles: Low Stock, Positive Stock, Stock Value (sale price / purchase price).
- Batches & Expiry (optional per-product), Serial Numbers (optional per-product).

**Verify**: creating an Invoice for a stocked product decrements stock and writes a ledger entry
pointing back at the invoice; a manual Stock Out on a batch-tracked product requires selecting a batch
and reduces that batch's quantity specifically.

---

## Phase 7 — Payments suite + ledgers

**Collections**: formalize `Payment`, add `PaymentLink`, `Journal`.

- Payments Timeline: unified view across all bank/cash/personal accounts with Net Balance/You
  Received/You Gave totals, filterable, linked back to source documents.
- Payment Links: generate a shareable, signed, time-boxed link for a specific amount/invoice.
- Journals: manual double-entry entry screen (account, debit/credit lines that must balance to zero
  before save).
- Bank Reconciliation: import a bank statement (CSV), match against Payments Timeline entries, surface
  unmatched items on both sides.

**Verify**: a Payment Link opened in an incognito/unauthenticated context works without a login, expires
after its time-box, and can't be replayed after expiry; an unbalanced Journal entry is rejected by
validation before it reaches the database.

---

## Phase 8 — Reports & Insights

- Insights dashboard: Cash In/Out, Products Sold, Customers, Pending Invoices, Invoices Created tiles;
  sales-trend chart; Total Sales/Purchases/Expenses/Indirect-Income cards; Payments-by-bank breakdown;
  Weekly Revenue chart. Follow the `dataviz` skill's guidance when building any chart here.
- Reports: Transaction, Bill-wise Item, Item, Party, P&L, Payments, Summary reports; Day Book; Document
  conversion history; Share History. Each with date-range filter and CSV/Excel/PDF export.
- Tax reports (data layer, no filing — see Phase 9 for the GST-specific screens): Sale Summary by HSN,
  TDS/TCS Receivable/Payable.

**Verify**: every report's numbers reconcile against a hand-checked sample period (e.g. P&L total
matches Sales minus Purchases minus Expenses plus Indirect Income for that range); CSV export opens
cleanly and matches the on-screen table.

---

## Phase 9 — GST module (report/data layer only)

**Collections**: `EwayBillData`, `EInvoiceData`, `GstReportSnapshot`.

- GSTR-1/2B/3B calculation engine computed entirely from local documents for a selected period.
- GSTR-1 Filing tracker: per-month view with a manual "mark as filed" flag (no live filing call).
- GSTR-2B Reconciliation: user imports a GSTR-2B export file; system diffs it against locally recorded
  purchases and flags mismatches/missing entries.
- E-way Bill / E-Invoice screens: generate the data object per document and offer a download in the
  government's documented JSON schema for manual upload — explicitly no outbound API call to NIC/a GSP.

**Verify**: GSTR-1 computed summary matches a manually-tallied total for a test period; the exported
JSON for an e-way bill validates against the publicly documented schema (structurally), confirming the
data layer is correct even though nothing is submitted anywhere.

---

## Phase 10 — POS + barcode + thermal printing

- POS billing screen: barcode scan/search, quantity-on-scan behavior, duplicate-item behavior — both per
  the Preferences → POS settings from Phase 2/3.
- Barcode Settings page (label customization) and barcode generation for products.
- Thermal Print Settings page and a thermal (58/80mm) receipt template in `lib/pdf/`, honoring every
  toggle (terms, notes, company details, item description, taxable amount, MRP, HSN/SAC, invoice time).

**Verify**: scanning the same barcode twice behaves per the configured duplicate-item setting; toggling
off "Show Invoice Time" in Thermal Print Settings removes it from the next printed receipt without
affecting the date.

---

## Phase 11 — Online Store + Business Link + Customer Portal

- Public storefront: product catalog (from Products & Services), online/offline toggle, shareable
  link + generated QR code.
- Order collection from the storefront (unlocked, unlike Swipe) — lands as a draft Invoice/Quotation.
- Business Link page: combines store link + Social Links (Settings) + contact info.
- Customer Portal: signed-link, no-login view of a specific customer's invoices and ledger.
- Customise Links settings (cover image, background, logo shape) wired into all of the above.

**Verify**: the storefront and portal are reachable without an authenticated session but reject a
tampered or expired signed link; an order placed on the storefront appears as a draft document in the
business's dashboard.

---

## Phase 12 — API & Webhooks + optional Payment Gateway

- API & Webhooks: issue business-scoped API keys tied to a Role (same RBAC checks as the UI), document
  the REST API, implement outbound webhooks for a documented event set (invoice created, payment
  received, document status changed) with signed payloads and retry-with-backoff (still
  request/response-triggered, not a background scheduler).
- Payment Gateway settings: connect a Razorpay-style sub-account (account ID, activation status,
  enable/disable), wire Payment Links (Phase 7) to actually collect online payment when configured.

**Verify**: an API key scoped to a read-only Role can `GET` invoices but a `POST` is rejected with 403;
a webhook payload's signature verifies correctly against the configured secret; a Payment Link with the
gateway enabled completes a real (sandbox) payment and marks the linked invoice paid.

---

## Phase 13 — Projects, bulk import/export, multi-business/branch

- Projects: bucket Invoices/Expenses/Purchases, compute project-level P&L.
- Bulk import/export for all masters (Products, Customers, Vendors, Price Lists) and documents —
  synchronous, chunked/streamed for large files, with per-row error reporting (see Phase 4's expense
  bulk-upload pattern, generalized).
- Multi-business/branch: UI for creating/switching between businesses under one user, confirming no
  data crosses tenant boundaries (this is largely a UI/UX phase — the data isolation itself was built
  in Phase 1 and should already hold).

**Verify**: a bulk product import with 3 intentionally-bad rows out of 100 reports exactly those 3 with
reasons, and commits the other 97; switching businesses in the UI never shows a flash of the previous
business's data.

---

## Phase 14 — Security hardening pass

- Full pass against the `CLAUDE.md` / `project_spec.md` security checklists: masked sensitive fields
  with audit-logged reveal, CSRF coverage audit, CSP/security headers review, rate-limiting audit on all
  public/unauthenticated routes, dependency and container vulnerability scan.
- Audit Log UI: searchable/filterable view of the `AuditLog` collection for admins.
- Backup/restore drill: perform and document an actual restore from a scheduled backup into a scratch
  environment.

**Verify**: an automated scan (e.g. `npm audit` / a container scanner) has no unaddressed high/critical
findings; a restored-from-backup instance boots and serves the same data as the source; a manual
attempt to read another business's document by guessing/incrementing an ID is rejected at the API
layer.

---

## Phase 15 — Design polish pass

- Invoke the `frontend-design` skill and do a deliberate visual pass over the whole app: typography,
  color, spacing, the sidebar/dashboard/table/modal patterns noted in `project_spec.md` → Design.
  Responsive layout down to mobile web width.

**Verify**: key flows (create invoice, record payment, view report) work and look intentional at
desktop, tablet, and mobile widths; no layout requires horizontal scrolling on a standard mobile
viewport except wide data tables (which get their own scroll container, not the page body).

---

## Phase 16 — Deployment hardening & documentation

- Set up the production Next.js process (no containers): a process manager (e.g. PM2 or the hosting
  platform's own process supervision) running `pnpm build && pnpm start`, with restart-on-crash and log
  rotation; a reverse proxy (Caddy/Nginx) in front for TLS termination.
- Confirm the production Atlas cluster: a dedicated production database (separate from dev/test),
  network access list locked down to the app's egress IP(s), a database user with only the privileges
  the app needs (not the Atlas project owner), and Atlas's built-in backup/point-in-time recovery
  enabled — document the restore procedure using Atlas's own restore flow rather than a custom
  `mongodump` sidecar.
- Write self-host setup docs: required env vars (including where to get the Atlas connection string),
  first-run steps (create first Business/Admin user), Atlas backup/restore instructions, upgrade
  procedure.

**Verify**: a fresh clone of the repo, following only the written docs, produces a working instance
with TLS and a first Admin login against the user's Atlas cluster, on a machine that never had the
project on it before; confirm the production database user cannot perform Atlas-project-level actions
(principle of least privilege).
