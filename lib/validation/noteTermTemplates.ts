import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/constants/documentTypes";
import { optionalTrimmed } from "@/lib/validation/shared";

export const noteTermTemplateSchema = z.object({
  docType: z.enum(DOCUMENT_TYPES),
  kind: z.enum(["note", "term"]),
  title: optionalTrimmed(100),
  body: z.string().trim().min(1, "Body is required").max(5000),
  isActive: z.boolean(),
});
export type NoteTermTemplateInput = z.infer<typeof noteTermTemplateSchema>;

export const noteTermTemplateListQuerySchema = z.object({
  docType: z.enum(DOCUMENT_TYPES).optional(),
  kind: z.enum(["note", "term"]).optional(),
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
