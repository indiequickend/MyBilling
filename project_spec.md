# Project Spec — Self-Hosted GST Billing / Invoicing / Inventory / Accounting Platform

Functional specification for a from-scratch, self-hosted clone of Swipe (app.getswipe.in), built with
Next.js + MongoDB. This is the _what_ — see `CLAUDE.md` for _how_ and `build_phases.md` for _when_.

Research basis: a live, read-only walkthrough of every module of a real Swipe account (business
"QuickTrails", a travel agency), Swipe's public "Advanced Features" catalog, and Swipe's public pricing
page (the exact tier/limit matrix). Every feature below is unlocked and unmetered in this clone unless
listed under **Out of Scope**.

## Out of scope (explicit — do not build)

| Area                                                                                                     | Why                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI features (chat assistant, AI document OCR, AI-assisted invoice creation)                              | Not required                                                                                                                                                                                                              |
| Live GST integrations: e-invoice IRN generation, e-way bill generation via NIC, GSTR auto-filing via GSP | Requires a real, paid GST Suvidha Provider account — external dependency, not something to fake. The **calculation and report layer** (GSTR-1/2B/3B, HSN summaries) is in scope; the outbound government API call is not. |
| Delivery Challans, Packing Lists, Shiprocket shipment tracking                                           | Not required                                                                                                                                                                                                              |
| Tally integration/sync                                                                                   | Not required                                                                                                                                                                                                              |
| Subscriptions / recurring invoices                                                                       | Not required                                                                                                                                                                                                              |
| Any background job / queue / scheduler (Redis, BullMQ, cron)                                             | Not required — everything runs synchronously per-request. This also removes: auto-scheduled reminders (SMS/Email/WhatsApp on due dates), cron-generated recurring documents, async bulk-job pipelines.                    |
| WhatsApp / SMS sending                                                                                   | Only existed to serve scheduled reminders, which are out of scope                                                                                                                                                         |
| Seat/plan-based limits of any kind (users, businesses, storage, "N free then credits")                   | Explicitly rejected — one full-featured capability set for everyone                                                                                                                                                       |
| Swipe Wallet-style credit metering                                                                       | Same reason as above                                                                                                                                                                                                      |

## Tenancy, Auth, and RBAC

### Tenancy model

- **Business** is the tenant boundary. A business has company details (see Settings), its own customers,
  vendors, products, documents, ledgers, and settings.
- **Membership** links a **User** to a **Business** with a **Role**. A user can hold memberships in any
  number of businesses (Swipe calls this "Multiple Business/Branches" and paywalls it — here it's just how
  the data model works, unlimited by default).
- Every tenant-scoped collection carries `businessId`; there is no cross-business query path in the data
  access layer.

### Auth

- Primary: email + password. Passwords hashed with argon2id. Account lockout/backoff after repeated
  failed attempts.
- Optional 2FA per user: TOTP (authenticator app) or SMS OTP via a pluggable SMS provider interface (no
  provider wired by default — self-hosters configure their own, e.g. MSG91/Twilio, if they want SMS 2FA).
- Sessions: opaque session IDs backed by a `Session` collection (not a stateless JWT) so sessions are
  revocable. httpOnly, `Secure`, `SameSite=Lax` cookies.
- User Profile page (mirrors Swipe): avatar, name, email (with verification), phone number (optional,
  used only for SMS 2FA if enabled), "manage active sessions" (list + revoke), "reset account data" and
  "delete account" (soft, with an admin-configurable grace period before hard purge).

### RBAC

- **Role**: a named set of permissions, scoped to a business. Two ways to create one (mirrors Swipe's
  "Add New Role" modal):
  1. **Start from a system template** (e.g. "Admin", "Accounts", "Sales Manager") and customize.
  2. **Start from scratch** — a blank permission matrix.
- Permission matrix is per-module, per-action: e.g. `invoices.create`, `invoices.edit`, `invoices.delete`,
  `invoices.view`, `payments.record`, `reports.view`, `settings.manage_users`, etc. — one row per module
  listed below, columns for view/create/edit/delete/export at minimum.
- Every mutating API route resolves the caller's membership+role for the target `businessId` and checks
  the specific permission before proceeding — never inferred from the UI alone.
- All Users page: list of members with role assignment, activate/deactivate — **no seat-limit banner**,
  unlimited members.

## Modules

### Sales

- **Invoices**: the core document. Customer picker (search by name/company/GSTIN/tags, or create inline),
  invoice date, due date, reference field, **custom header fields** (businesses can define their own
  extra fields on documents — e.g. a travel agency's "Booked By"/"Journey Start Date"/"Journey End
  Date"/"Group Tour Ref" — implemented as a per-business, per-document-type custom field schema, not
  hardcoded), line items (product/service search or barcode scan, qty, unit price, tax, per-line
  discount), document-level discount (amount or %, configurable target: unit price / price-with-tax / net
  amount / total), round-off toggle, terms & conditions (from a reusable template), reverse-charge
  toggle, e-way-bill/e-invoice flag (data-only, see Out of Scope), file attachments, coupon application,
  bank account selection (for showing account/UPI QR on the printed document), inline payment recording
  at save time (amount, mode, date, bank, with split-payment across multiple modes/accounts), signature
  selection, Save as Draft / Save & Print / Save. Status: pending / paid / partially paid / cancelled.
  List view: filter tabs (All/Pending/Paid/Cancelled/Drafts), search, date range, running totals footer
  (Total/Paid/Pending).
- **Credit Notes** (sales returns): same document shape as an invoice, linked to an original invoice,
  reduces customer balance.
- **E-Invoices**: a status list (All/Success/Pending/Failed/Cancelled) tracking which invoices have been
  flagged for e-invoicing and their IRN status — since live IRN generation is out of scope, this list
  reflects locally-computed eligibility/validation state, not a real government response.

### Purchases

- **Purchases**: vendor bills, mirrors the Invoice shape (vendor instead of customer, purchase-side tax
  treatment, no customer-facing print concerns like signature/QR).
- **Purchase Orders**: pre-purchase commitment document, convertible to a Purchase.
- **Debit Notes**: purchase returns, linked to an original purchase, mirrors Credit Notes.

### Quotations+

- **Quotations / Estimates**: pre-sale document, statuses Open/Closed/Partial/Cancelled, convertible to
  an Invoice or Sales Order.
- **Sales Orders**: confirmed-order document sitting between Quotation and Invoice.
- **Pro Forma Invoices**: a non-legal preview invoice, same custom-header behavior as Invoices (this is
  where the travel-agency example above was actually observed — Journey Start/End Date, Group Tour Ref).

### Expenses+

- **Expenses**: category (user-defined categories, with a management screen), amount, mode, vendor
  (optional), description, supplier details, date, status, receipt attachment. Bulk upload via
  spreadsheet import (synchronous — see Out of Scope re: background jobs).
- **Indirect Income**: same shape as Expenses but for non-sales income (e.g. interest, refunds), kept
  separate for P&L classification.

### Products & Services

- **Items**: name, type (Product or Service), HSN (goods) / SAC (services) code, unit, purchase price,
  selling price (inclusive/exclusive of tax per business default), tax rate, variants (e.g. size/color —
  each variant is its own stock-tracked SKU under a shared parent item), barcode, category, image
  (Cloudinary). Soft-delete with a restorable "Deleted" list.
- **Categories**, **Groups** (broader groupings than category, for reporting/filtering), **Price Lists**
  (multiple named price books per business, e.g. wholesale vs retail — a product can have a different
  price per list).

### Inventory

- **Warehouses**: multiple named stock locations per business (no cap).
- **Stock ledger**: every Stock In / Stock Out event (manual adjustment, or automatic from a
  Purchase/Invoice/Credit Note/Debit Note) recorded with quantity, reason, warehouse, resulting balance —
  this is the "Timeline" view.
- Dashboard tiles: Low Stock count, Positive Stock count/qty, Stock Value at sale price, Stock Value at
  purchase price.
- **Batches & Expiry**: optional per-product batch tracking with expiry date, surfaced in stock alerts.
- **Serial Numbers**: optional per-unit serial/IMEI tracking for products that need it.

### Payments

- **Timeline**: a unified, filterable ledger of every payment event across every bank/cash account,
  linked to the document it settles (or unlinked / advance). Columns: amount, mode, linked document,
  party, date, account, created-by. Running totals: Net Balance, You Received, You Gave.
- **Payment Links**: generate a shareable payment-collection link for a specific amount/invoice (actual
  online collection requires the Payment Gateway integration below to be configured).
- **Journals**: manual double-entry journal entries for anything that isn't a standard
  sale/purchase/expense/payment — the escape hatch for real bookkeeping.
- **Bank Reconciliation**: match Payments-Timeline entries against an imported bank statement, flag
  discrepancies.
- **Bank accounts**: multiple bank accounts + one implicit Cash account + arbitrary "personal/owner"
  accounts, each with a UPI ID that (optionally) renders a dynamic UPI QR code on printed
  invoices/receipts. "Transfer Funds" moves money between two accounts as a linked pair of ledger entries.
  Deleting an account that's referenced by existing documents is blocked/warned, since it would corrupt
  historical documents.

### Customers & Vendors

- List with search, **Groups** (arbitrary tagging/grouping for bulk actions and reporting), and a
  soft-delete **Deleted** trash tab.
- Detail view (used identically for both Customers and Vendors): **Ledger** (running-balance transaction
  list, "You Got"/"You Gave" quick payment entry), **Transactions** (all linked documents), **Bill-wise
  Transactions** (payments matched to specific bills), **Activity** (audit trail of changes to this
  party's record). A **shareable, signed, time-boxed public ledger link** lets the party view their own
  balance without logging in.

### Projects

- A Project buckets a set of Invoices/Expenses/Purchases together to compute project-level revenue, cost,
  and profit — for businesses that sell project-based work rather than discrete transactions.

### Insights (dashboard)

- Cash In / Cash Out tiles, Products Sold, Customers count, Pending Invoices, Invoices Created — all for
  a selectable date range.
- Sales-trend line/bar chart with an average line, Total Sales/Purchases/Expenses/Indirect-Income cards,
  Payments-by-bank breakdown (incoming/outgoing per account), Pending Invoices widget, Weekly Revenue
  chart.

### Reports

- **Taxes**: GSTR-1, GSTR-2B, GSTR-3B, GSTR-7 (all computed locally from stored documents — see Out of
  Scope for the government-filing boundary), Sale Summary by HSN, TDS Receivable/Payable, TCS
  Receivable/Payable.
- **Transaction Reports**, **Bill-wise Item Reports**, **Item Reports**, **Party Reports**, **Profit &
  Loss (P&L) Reports**, **Payments Reports**, **Summary Reports**: standard cross-cuts of the same
  underlying document data, each with a date-range picker and export (CSV/Excel/PDF).
- **Day Book**: chronological list of every transaction of every type on a given day.
- **Document conversion**: convert one document type to another (Quotation → Invoice, Purchase Order →
  Purchase, etc.), preserving line items.
- **Share History**: audit of when/to-whom a document or report was shared.

### Online Store (unlocked, unlike Swipe's paywall)

- A public, read-only product catalog storefront for a business, reachable via a shareable link and a
  generated QR code, togglable online/offline.
- **Order collection** is included (Swipe paywalls this as an "upgrade" — here it's part of the base
  module): a customer can place an order from the storefront, which lands as a draft
  Invoice/Quotation for the business to confirm.
- **Business Link**: a linktree-style page combining store link, social links (see Settings), and contact
  details.
- **Customer Portal**: a self-service, signed-link portal where a customer/vendor can view their own
  invoices and ledger without a full login.

### GST & Compliance (report/data layer only — see Out of Scope)

- **E-way Bills**: generate the internal e-way-bill data object (vehicle, distance, transporter details)
  tied to a document; no NIC API call. Exportable in the government's JSON schema for manual upload.
- **GSTR-1 Filing tracker**: month-by-month view of transaction counts and locally-computed filing data;
  "Filed"/"Not Filed" status is a manual business-side flag, not a real filing confirmation.
- **GSTR-2B Reconciliation**: compares purchases recorded in this system against a manually-imported
  GSTR-2B file (rather than a live GST-portal pull) to flag missing/mismatched ITC.

### POS (Point of Sale)

- A fast billing screen: barcode scan or search to add line items, quantity defaults to 1 on scan
  (configurable to prompt), duplicate-scan behavior configurable (increment qty vs. new line), cash/other
  payment capture, thermal receipt print (see Settings → Thermal Print) with optional SMS-to-customer
  and QR code on the receipt.

## Settings

A large, dedicated section of the app — every sub-area below is a first-class screen.

### Profile

- **Company Details**: logo (Cloudinary), brand name vs. legal company name, phone, email, GSTIN with a
  "Fetch Details" auto-fill (calls the public GST taxpayer lookup, not a filing API — allowed since it's
  read-only public data, not a paid GSP action), business type, alternate contact, website, PAN, a
  business-defined **custom fields** list (e.g. MSME Registration, Trade License), billing address,
  shipping address.
- **User Profile**: see Auth section above.
- **All Users / Roles**: see RBAC section above.

### General Settings

- **Preferences** (tabbed):
  - _Document_: round-off toggle, extra-discount type default, "show header-field suggestions" toggle,
    default due date, default discount type — each independently scoped per document category
    (Sales/Purchases/Conversions).
  - _Products & Inventory_: default item type (Product vs Service), default price inclusive/exclusive of
    tax, max discount % allowed per line item, default unit, default tax rate. Sub-tabs for
    Product/Inventory/Batch defaults.
  - _POS_: activate POS module, send SMS to customer on POS sale (adapter, off by default — see Out of
    Scope re: SMS), show QR code / cash-received / brand name on the receipt, barcode-scan quantity
    behavior, allow-duplicate-line-items toggle.
  - _Customise Links_: cover image, background image (with pattern presets) or color, logo shape — this
    is the branding config consumed by the Online Store / Business Link pages.
  - _Notifications_: three toggle categories — Promotional, Alerts (low stock/pending invoices/expiring
    batches), Transactional (payments received, documents created, new logins) — all in-app only.
  - _Email_: sender display name (brand name or custom), custom sender email/domain (SMTP config), CC/BCC
    lists applied to all outgoing document emails, editable email templates per document type.
- **Thermal Print Settings**: independent toggles for which elements print on a thermal receipt — terms,
  invoice notes, company details, item description, taxable amount, MRP, item HSN/SAC, invoice time.
- **Barcode Settings**: show package date / price-with-tax on generated barcodes, custom MRP label text,
  MRP font size, product-name font size, barcode text length (4–10 chars).
- **Signatures**: multiple named signature images (upload), one marked default, a "No Signature" option
  selectable per document.
- **Notes & Terms**: reusable Notes and Terms templates, scoped per document type (Invoice, Purchase,
  etc.), each markable default/active.

### Banks and Payments

- **Banks**: see Payments module above (accounts, UPI QR, transfer funds).
- ~~Swipe Wallet~~ — not replicated (see Out of Scope).

### Integrations & Apps

- **Payment Gateway**: connect a payment-gateway sub-account (Razorpay-style connected-account model:
  account ID, activation status, an explicit enable/disable toggle, custom-domain-for-checkout setup) to
  accept online payments against invoices/payment links.
- **API & Webhooks**: a documented REST API (using the same permission model as the UI — an API key is
  tied to a business+role) plus outbound webhooks for key events (invoice created, payment received,
  document status changed), for external system integration.
- **More** (integrations directory, categorized): Payments & Accounting (Payment Gateway, Digital
  Signature, Connected Banking), Communication (Custom Email — WhatsApp dropped, see Out of Scope),
  Online Presence (Online Store, Custom Domains, Business Link, Customer Portal), Commerce (Shopify,
  WooCommerce sync — product/order sync only, no fulfillment/shipping features).

### Others

- **Advanced Features**: in Swipe this page is a sales catalog of paywalled add-ons ("Talk to a
  Specialist"). In this clone it does not exist as a separate page, because there is nothing left to
  upsell — every capability it lists elsewhere in Swipe is already a first-class, unlocked feature here.
  (Documented here so the mapping from Swipe's feature list to this spec is traceable — see the table in
  the project README/notes if one is added later.)
- **Social Links**: Facebook/Instagram/LinkedIn/YouTube/Website URLs + a Google Place ID — feeds the
  Online Store / Business Link pages.
- **Referral**, **Support**: simple static/contact pages, low priority.

## Data model (MongoDB collections)

All collections below carry `businessId` (except `User`, `Session`, and `Business` itself),
`createdAt`, `updatedAt`, and — where the corresponding Swipe screen has a "Deleted" tab — a nullable
`deletedAt` for soft-delete.

| Collection                                                                                                      | Purpose                                        | Key fields (non-exhaustive)                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `User`                                                                                                          | login identity                                 | email, passwordHash, totpSecret?, phone?                                                                                    |
| `Session`                                                                                                       | revocable server-side sessions                 | userId, expiresAt, userAgent/ip (for the "manage sessions" list)                                                            |
| `Business`                                                                                                      | tenant                                         | name, brandName, gstin, businessType, addresses, customFieldDefs                                                            |
| `Membership`                                                                                                    | user↔business↔role                             | userId, businessId, roleId, status (active/inactive)                                                                        |
| `Role`                                                                                                          | permission set                                 | businessId, name, permissions (map of module→actions), isTemplate                                                           |
| `Customer` / `Vendor`                                                                                           | parties                                        | name, contactInfo, gstin?, groupIds, closingBalance (derived/cached)                                                        |
| `PartyGroup`                                                                                                    | grouping for Customer/Vendor                   | name, memberIds                                                                                                             |
| `Product`                                                                                                       | items                                          | name, type, hsnSac, unit, prices, taxRate, categoryId, groupId, variants[], barcode                                         |
| `ProductCategory`, `ProductGroup`, `PriceList`                                                                  | product organization                           | —                                                                                                                           |
| `Warehouse`                                                                                                     | stock location                                 | name                                                                                                                        |
| `StockLedgerEntry`                                                                                              | inventory movement                             | productId, warehouseId, qty, direction, reason, refDocument                                                                 |
| `Invoice`, `CreditNote`, `Purchase`, `PurchaseOrder`, `DebitNote`, `Quotation`, `SalesOrder`, `ProformaInvoice` | sales/purchase documents                       | partyId, docNumber, date, dueDate, lineItems[], taxSummary, customFields, status, signatureId, bankAccountId, attachments[] |
| `Expense`, `IndirectIncome`                                                                                     | non-document money movement                    | categoryId, amount, mode, description                                                                                       |
| `Payment`                                                                                                       | ledger of money movement                       | amount, mode, date, bankAccountId, linkedDocument?, partyId?                                                                |
| `PaymentLink`                                                                                                   | shareable payment request                      | amount, linkedDocument?, status                                                                                             |
| `Journal`                                                                                                       | manual double-entry                            | lines[] (account, debit/credit)                                                                                             |
| `BankAccount`                                                                                                   | bank/cash/personal accounts                    | type, name, accountNumber (masked in UI), ifsc, upiId                                                                       |
| `Project`                                                                                                       | groups documents for profit tracking           | name, linkedDocumentIds[]                                                                                                   |
| `EwayBillData`, `EInvoiceData`                                                                                  | GST document metadata (no live filing)         | refDocument, computed fields, export status                                                                                 |
| `GstReportSnapshot`                                                                                             | computed GSTR-1/2B/3B/HSN summary for a period | period, computedData, manualFiledFlag                                                                                       |
| `Signature`                                                                                                     | signature images                               | imageUrl (Cloudinary), isDefault                                                                                            |
| `NoteTermTemplate`                                                                                              | reusable notes/terms                           | docType, body, isDefault, isActive                                                                                          |
| `Attachment`                                                                                                    | generic file references                        | url (Cloudinary), linkedTo                                                                                                  |
| `AuditLog`                                                                                                      | immutable action log                           | businessId, userId, action, target, before/after (redacted), timestamp                                                      |
| `Settings`                                                                                                      | per-business preferences                       | the full Preferences/Thermal/Barcode/Notification/Email config tree                                                         |

## Security requirements

(Full detail lives in `CLAUDE.md` → Security rules; this is the spec-level statement of intent.)

- Strong password hashing (argon2id), optional 2FA, revocable sessions, rate-limited auth endpoints.
- Strict tenant isolation via `businessId` on every query, enforced in one shared data-access layer.
- Server-side RBAC checks on every mutating route.
- Zod validation at every API boundary; no string-built Mongo queries.
- Sensitive fields (bank account numbers, PAN, GSTIN) masked by default in the UI, full value only on
  explicit reveal, and that reveal is audit-logged.
- CSRF protection on cookie-authenticated mutations; standard security headers (CSP, HSTS, etc.).
- Public/unauthenticated surfaces (shareable ledger links, Online Store, Customer Portal, Payment Links)
  use signed, time-boxed tokens, never guessable sequential IDs, and are rate-limited.
- Immutable audit log for logins, permission changes, deletions, and payment edits.
- File uploads validated by type/size before reaching Cloudinary.
- All secrets via environment variables, never committed.
- Regular dependency/container scanning; scheduled, encrypted backups with a documented restore drill.

## Design

Visual design should be planned with the `/frontend-design` skill during the build phase dedicated to UI
polish (see `build_phases.md`). Notes from the research pass, for reference: clean white-background
layout, a persistent collapsible left sidebar grouped into the modules above, card-based dashboard tiles,
colored status pills (e.g. green=paid, amber=pending), data tables with a sticky totals footer row, and
modal-based quick actions (payment entry, role creation) rather than full page navigations for small
tasks.
