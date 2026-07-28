import { z } from "zod";

export const productGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type ProductGroupInput = z.infer<typeof productGroupSchema>;
