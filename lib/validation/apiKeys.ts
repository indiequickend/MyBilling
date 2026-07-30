import { z } from "zod";
import { objectId } from "@/lib/validation/shared";

export const apiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  roleId: objectId,
});
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
