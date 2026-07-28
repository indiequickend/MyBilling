import { z } from "zod";

export const signatureSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type SignatureInput = z.infer<typeof signatureSchema>;

export const signatureListQuerySchema = z.object({
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
