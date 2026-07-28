import { z } from "zod";

/** Shared across every entity schema that references another document by id. */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

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
