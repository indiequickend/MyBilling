# CLAUDE.md

Engineering guide for this repository — a self-hosted GST invoicing / billing / inventory / accounting
platform (a from-scratch clone of Swipe's functionality) built with **Next.js** and **MongoDB**.

Read `project_spec.md` for _what_ to build (modules, data model, workflows) and `build_phases.md` for
_when/in what order_. This file is _how_ — conventions every change in this repo must follow.

## Non-negotiables (read before touching code)

1. **Every tenant-scoped query filters by `businessId`.** This is a multi-tenant billing app; a missing
   tenant filter is a data leak between businesses, not a bug. All reads/writes to tenant-scoped
   collections go through the shared data-access layer (`lib/db/*`), never through an ad hoc
   `Model.find(...)` in a route handler. If you're writing a raw query, you're doing it wrong — use or
   extend the data-access layer instead.
2. **Every mutating route checks permissions server-side**, matching the module+action the route touches
   (see `project_spec.md` → Roles & Permissions). Never rely on the client hiding a button/menu item as
   the only access control.
3. **No artificial limits.** No seat caps, no per-feature usage counters, no "N free, then paywall", no
   watermarks, no locked menu items. If a scope decision excludes a feature entirely (AI, live GST/GSP
   filing, Delivery Challans/Packing Lists/Shiprocket, Tally, Subscriptions, background jobs — see
   `project_spec.md` → Out of Scope), it is simply absent, not present-but-gated.
4. **No background job infrastructure.** No queue, no worker, no Redis. Everything the user does happens
   synchronously in that request. Don't introduce `setTimeout`-based schedulers, cron packages, or
   external job runners — if a feature seems to need one, it's probably in the out-of-scope list.
5. **Security is the top priority**, ahead of speed of delivery. When a phase's checklist and a shortcut
   conflict, follow the checklist.

## Tech stack

| Concern          | Choice                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 15.3.x (App Router), TypeScript, strict mode on — pinned to the 15.x line, not 16, after 16.2.12 hit a build-breaking prerender bug in this environment                         |
| UI               | React 19.0.x (pinned — newer 19.2.x React caused RSC payload errors when paired with Next 15.3.9); Server Components by default, Client Components only where interactivity requires it |
| Styling          | Tailwind CSS                                                                                                                                                                            |
| Database         | MongoDB, accessed via Mongoose                                                                                                                                                          |
| Validation       | Zod — one schema per shape, shared between client form validation and the API boundary where practical                                                                                  |
| Auth             | Custom email+password (argon2id) + optional TOTP/SMS 2FA — see `project_spec.md` → Auth                                                                                                 |
| File storage     | Cloudinary (logos, signatures, attachments, product images)                                                                                                                             |
| PDF generation   | `@react-pdf/renderer` (pure JS, no headless browser/Chromium binary — required for Vercel serverless functions) for invoices, POs, quotations, thermal receipts                          |
| Testing          | Vitest for unit/integration, Playwright for e2e                                                                                                                                         |
| Package manager  | pnpm                                                                                                                                                                                    |
| Database hosting | MongoDB Atlas (managed cluster — connection string supplied via `MONGODB_URI`, no local/self-hosted Mongo, no Docker)                                                                   |

Do not introduce Redis, a job queue, an ORM other than Mongoose, or an AI/LLM dependency without an
explicit decision recorded in `project_spec.md` — these were deliberately scoped out. Do not introduce
Docker/Compose either — the app runs as a plain Node.js process (`pnpm dev` / `pnpm build && pnpm start`)
against a remote Atlas cluster.

## Folder structure

```
app/                        # Next.js App Router — route segments mirror project_spec.md modules
  (auth)/                    # login, signup, 2FA setup — unauthenticated layout
  (dashboard)/               # authenticated app shell (sidebar nav from project_spec.md)
    sales/
    purchases/
    quotations/
    expenses/
    products/
    inventory/
    payments/
    customers/
    vendors/
    projects/
    insights/
    reports/
    online-store/
    settings/
  api/                       # Route Handlers, grouped the same way as the pages that call them
lib/
  db/                        # Mongoose models + the ONLY place tenant-scoped queries are written
    models/
    queries/                 # one file per collection; every exported function takes businessId
  auth/                      # session issuance/validation, password hashing, 2FA
  rbac/                      # permission definitions + the `can(user, action, resource)` check
  pdf/                       # HTML→PDF rendering + document templates
  storage/                   # Cloudinary adapter behind a small interface
  validation/                # Zod schemas, one module per domain entity
components/
  ui/                        # generic design-system primitives
  <module>/                  # module-specific components (invoices/, customers/, ...)
tests/
```

## Conventions

- **TypeScript strict**, no `any` without a comment explaining why it's unavoidable.
- **One Zod schema per entity**, colocated in `lib/validation/`, imported by both the form and the API
  route — don't hand-roll duplicate validation logic in two places.
- **Money is stored as integer minor units** (paise), never as floating point. Format for display at the
  UI edge only.
- **Dates/times stored in UTC**; format to the business's locale/timezone at render time.
- **Every collection has `businessId`, `createdAt`, `updatedAt`, and a soft-delete `deletedAt`** (Swipe's
  "Deleted" tabs on Customers/Vendors/Products are soft-delete, not hard-delete — mirror that).
- **Document numbering** (invoice/purchase/etc. sequence numbers) is generated server-side inside the
  same transaction as document creation — never client-supplied, never a gap-prone read-then-increment
  without a lock.
- **Naming**: collections/models are singular PascalCase (`Invoice`, `CreditNote`); route segments and
  files are kebab-case; React components are PascalCase.
- Prefer editing/extending an existing query function in `lib/db/queries/` over writing a new one-off
  query in a route handler.

## Security rules (see `project_spec.md` → Security for the full list)

- Never log secrets, full bank account numbers, full PAN, or full GSTIN — mask in logs the same way the
  UI masks them.
- Never build a Mongo query by string-concatenating user input; use Mongoose query builders/Zod-validated
  inputs only, to prevent NoSQL operator injection (e.g. a client sending `{ "$gt": "" }` as a field
  value).
- Any route that returns data reachable without a session (shareable ledger links, the online-store
  storefront) must use a signed, time-boxed token — never a guessable sequential ID.
- File uploads: validate MIME type and size before handing to the Cloudinary adapter; never trust the
  client-reported content-type alone.
- All secrets (Mongo URI, Cloudinary keys, SMTP creds, session signing key) come from environment
  variables. `.env.example` lists every required variable with a placeholder; `.env` is gitignored and
  never committed.

## Running locally

```
pnpm install
cp .env.example .env      # fill in MONGODB_URI (Atlas connection string), Cloudinary, session secret
pnpm dev
```

There is no local database container — `MONGODB_URI` always points at a MongoDB Atlas cluster (a
dedicated dev/test cluster or database, never the same one as production). Atlas also owns
backups/point-in-time recovery, so there is no self-managed backup sidecar to run.

**`NODE_ENV` gotcha**: if your shell has `NODE_ENV` pre-exported (common on some setups), `next build`
can mix dev/prod runtime chunks and fail prerendering with an obscure `Cannot read properties of
undefined (reading 'env')` error. The `dev`/`build`/`start` scripts already force the correct value via
`cross-env` for this reason — always run them through `pnpm dev` / `pnpm build` / `pnpm start` rather
than invoking `next` directly, unless you also set `NODE_ENV` explicitly yourself.

## Testing

- Unit/integration tests (Vitest) live next to the code they test (`*.test.ts`) or under `tests/unit`.
- Every `lib/db/queries/*` function gets a test that verifies it does not leak data across `businessId`
  values — this is the single most important test category in the app.
- E2E (Playwright) covers one full happy-path per module (create → view → edit → soft-delete) plus the
  login/RBAC-denial paths.
- Run `pnpm test` before considering any phase from `build_phases.md` complete.

## Working through `build_phases.md`

- Phases are meant to be built in order — later phases assume earlier collections/auth/RBAC exist.
- Each phase in `build_phases.md` has its own verification checklist; treat it as the definition of done
  for that phase, not just a suggestion.
- If a phase turns out to need a decision not covered by `project_spec.md`, stop and ask rather than
  guessing — especially anything touching money, tax calculation, or access control.
