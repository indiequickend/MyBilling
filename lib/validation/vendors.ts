import { z } from "zod";
import {
  addressSchema,
  gstinSchema,
  objectId,
  optionalFormatted,
  optionalTrimmed,
} from "@/lib/validation/shared";

export const vendorSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(200),
  companyName: optionalTrimmed(200),
  gstin: gstinSchema,
  email: optionalFormatted(z.string().trim().toLowerCase().email("Enter a valid email address")),
  phone: optionalTrimmed(20),
  groupIds: z.array(objectId).default([]),
  notes: optionalTrimmed(1000),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const vendorAddressesSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
});

export const vendorListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  groupId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
