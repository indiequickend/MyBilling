import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/constants/businessTypes";
import {
  addressSchema,
  customFieldDefsSchema,
  gstinSchema,
  optionalFormatted,
  optionalTrimmed,
} from "@/lib/validation/shared";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const businessDetailsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  brandName: optionalTrimmed(200),
  gstin: gstinSchema,
  pan: optionalFormatted(
    z.string().trim().toUpperCase().regex(PAN_REGEX, "Enter a valid 10-character PAN"),
  ),
  businessType: optionalFormatted(z.enum(BUSINESS_TYPES)),
  phone: optionalTrimmed(20),
  email: optionalFormatted(z.string().trim().toLowerCase().email("Enter a valid email address")),
  alternateContact: optionalTrimmed(20),
  website: optionalTrimmed(200),
});
export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;

export const businessAddressesSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
});
export type BusinessAddressesInput = z.infer<typeof businessAddressesSchema>;

export const businessCustomFieldDefsSchema = customFieldDefsSchema;

/**
 * Values for business-defined custom fields are validated dynamically against
 * the business's own def list — the shape isn't knowable statically, so this
 * is a schema factory rather than a static export. Phase 3's per-document
 * custom fields will need the identical pattern.
 */
export function buildCustomFieldValuesSchema(
  defs: Array<{
    key: string;
    type: "text" | "number" | "date" | "select";
    required: boolean;
    options?: string[];
  }>,
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    let fieldSchema: z.ZodTypeAny;
    switch (def.type) {
      case "number":
        fieldSchema = z.coerce.number();
        break;
      case "date":
        fieldSchema = z.string().trim().min(1);
        break;
      case "select":
        fieldSchema = z.enum((def.options ?? []) as [string, ...string[]]);
        break;
      default:
        fieldSchema = z.string().trim().max(500);
    }
    shape[def.key] = def.required ? fieldSchema : optionalFormatted(fieldSchema);
  }
  return z.object(shape);
}
