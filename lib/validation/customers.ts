import { z } from "zod";
import {
  addressSchema,
  gstinSchema,
  objectId,
  optionalFormatted,
  optionalTrimmed,
} from "@/lib/validation/shared";

export const customerSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(200),
  companyName: optionalTrimmed(200),
  gstin: gstinSchema,
  email: optionalFormatted(z.string().trim().toLowerCase().email("Enter a valid email address")),
  phone: optionalTrimmed(20),
  groupIds: z.array(objectId).default([]),
  notes: optionalTrimmed(1000),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerAddressesSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
});

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  groupId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});

/** One CSV row of the bulk-upload format. `groupNames` is a comma-separated list of free-text
 * group names (auto-created if new), not raw ids — a spreadsheet author shouldn't have to look up
 * ObjectIds by hand. */
export const customerRowSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(200),
  companyName: optionalTrimmed(200),
  gstin: gstinSchema,
  email: optionalFormatted(z.string().trim().toLowerCase().email("Enter a valid email address")),
  phone: optionalTrimmed(20),
  groupNames: optionalTrimmed(500),
  notes: optionalTrimmed(1000),
});
export type CustomerRowInput = z.infer<typeof customerRowSchema>;
