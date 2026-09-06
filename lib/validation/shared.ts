import { z } from "zod";

/** Shared across every entity schema that references another document by id. */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

/**
 * Parses a date cell from a bulk-upload CSV (invoices, purchases, purchase orders, proforma
 * invoices, payments — any historical-data migration). Accepts DD-MM-YYYY — the source-of-truth
 * format for a migration like this: it's what an export like Swipe's produces, and what Excel
 * round-trips a date column back to when the file is opened/saved on an Indian-locale machine —
 * with a fallback to plain ISO YYYY-MM-DD. Deliberately does NOT fall back to `new Date(value)`:
 * for an unambiguous DD-MM-YYYY value like "21-07-2026" that correctly returns Invalid Date, but
 * for an ambiguous one like "01-04-2026" it silently parses as a *different*, wrong date (April 1
 * instead of the intended January 4) instead of failing — the kind of silent date corruption that
 * must never happen for financial records.
 */
export function parseCsvDate(value: string): Date | undefined {
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value);
  if (dmy) {
    const [, d, m, y] = dmy;
    return dateFromParts(Number(y), Number(m), Number(d));
  }
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (ymd) {
    const [, y, m, d] = ymd;
    return dateFromParts(Number(y), Number(m), Number(d));
  }
  return undefined;
}

/**
 * Fills in "" for any of `columns` missing entirely from a raw CSV row object, so a flat
 * (non-grouped) bulk-upload row schema behaves the same whether an optional column's cell is
 * blank or the column header is absent altogether. Needed because `optionalRupeesToMinorUnits`
 * (used for optional money columns) requires its input to be a string or number — a genuinely
 * missing key is `undefined`, which fails that union — while `optionalTrimmed` already tolerates
 * `undefined` via its own `.optional()`. Grouped bulk-upload formats (see
 * lib/validation/invoices.ts's ProductCsvRawGroup-style raw groups) don't need this: their
 * grouping function already builds every field from an explicit "" default.
 */
export function fillMissingCsvColumns<T extends readonly string[]>(
  row: Record<string, string>,
  columns: T,
): Record<string, string> {
  const filled: Record<string, string> = { ...row };
  for (const col of columns) {
    if (!(col in filled)) filled[col] = "";
  }
  return filled;
}

function dateFromParts(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects e.g. day 31 in a 30-day month, which Date.UTC would otherwise silently roll over into
  // the next month instead of treating as invalid.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return date;
}

/**
 * Forms collect money as a rupees string (e.g. "1234.50"); CLAUDE.md requires
 * storage as an integer minor unit (paise). Accepts up to 2 decimal places.
 */
export const rupeesToMinorUnits = z.union([z.string(), z.number()]).transform((val, ctx) => {
  const str = typeof val === "number" ? val.toString() : val.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
  const [rupees, paise = ""] = str.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
});

/** Same as rupeesToMinorUnits but allows an empty string to mean "not set". */
export const optionalRupeesToMinorUnits = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === "string" ? val.trim() : val))
  .pipe(z.union([z.literal(""), rupeesToMinorUnits]))
  .transform((val) => (val === "" ? undefined : val));

/** An optional trimmed string field where an empty submission is stored as absent, not "". */
export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** Like optionalTrimmed, but validates a format (regex/email/etc.) only when non-empty. */
export function optionalFormatted<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    schema.optional(),
  );
}

export const addressSchema = z.object({
  line1: optionalTrimmed(200),
  line2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  state: optionalTrimmed(100),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(100),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** HTML checkboxes are absent from FormData when unchecked, present ("on") when checked. */
export function parseCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

/**
 * Parses `${prefix}__{index}__{field}` formData keys (e.g. `variant__0__name`)
 * into an array of row objects ordered by index — the encoding used by every
 * dynamic-row client editor (product variants, price overrides).
 */
export function parseIndexedRows(formData: FormData, prefix: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  const re = new RegExp(`^${prefix}__(\\d+)__(.+)$`);
  for (const key of formData.keys()) {
    const match = re.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2];
    if (!rows.has(index)) rows.set(index, {});
    rows.get(index)![field] = String(formData.get(key) ?? "");
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

/** Reads `${prefix}Line1`, `${prefix}City`, etc. back out of a submitted form. */
export function parseAddressFromFormData(formData: FormData, prefix: string) {
  return {
    line1: String(formData.get(`${prefix}Line1`) ?? ""),
    line2: String(formData.get(`${prefix}Line2`) ?? ""),
    city: String(formData.get(`${prefix}City`) ?? ""),
    state: String(formData.get(`${prefix}State`) ?? ""),
    postalCode: String(formData.get(`${prefix}PostalCode`) ?? ""),
    country: String(formData.get(`${prefix}Country`) ?? ""),
  };
}

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/**
 * One definition shape shared by every per-business custom-field mechanism —
 * Business-level custom fields this phase, and (per project_spec.md) Phase 3's
 * per-document custom header fields later, without needing a redesign.
 */
export const customFieldDefSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores only"),
    label: z.string().trim().min(1).max(100),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    required: z.boolean(),
  })
  .superRefine((def, ctx) => {
    if (def.type === "select" && (!def.options || def.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Select fields need at least one option",
        path: ["options"],
      });
    }
  });
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const customFieldDefsSchema = z.array(customFieldDefSchema).superRefine((defs, ctx) => {
  const seen = new Set<string>();
  for (const [i, def] of defs.entries()) {
    if (seen.has(def.key)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate field key: ${def.key}`,
        path: [i, "key"],
      });
    }
    seen.add(def.key);
  }
});

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Optional GSTIN field — validated only when non-empty. Shared by Business/Customer/Vendor. */
export const gstinSchema = optionalFormatted(
  z.string().trim().toUpperCase().regex(GSTIN_REGEX, "Enter a valid 15-character GSTIN"),
);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * `discountValue`'s meaning depends on the sibling `discountType`: minor units (paise) when
 * "amount", a raw 0-100 percent when "percentage" — matching lib/documents/calc.ts and every
 * document line-item schema. A raw string/number is accepted since a form submits one text input
 * regardless of which discount type is selected; this normalizes it to a number or reports a Zod
 * issue at `discountValue`. Shared by every document type's line-item/discount schema (Invoice,
 * Purchase, PurchaseOrder, DebitNote, Quotation, SalesOrder, ProformaInvoice, CreditNote).
 */
export function normalizeDiscountValue(
  discountType: "amount" | "percentage",
  rawValue: string | number,
  ctx: z.RefinementCtx,
): number | typeof z.NEVER {
  if (discountType === "percentage") {
    const pct = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a discount percentage between 0 and 100",
        path: ["discountValue"],
      });
      return z.NEVER;
    }
    return pct;
  }
  const parsed = rupeesToMinorUnits.safeParse(rawValue);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Enter a valid discount amount", path: ["discountValue"] });
    return z.NEVER;
  }
  return parsed.data;
}
