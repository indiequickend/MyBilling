import { z } from "zod";
import { optionalTrimmed } from "@/lib/validation/shared";

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: optionalTrimmed(500),
});
export type ProjectInput = z.infer<typeof projectSchema>;
