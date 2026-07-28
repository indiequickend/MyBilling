import { z } from "zod";

export const productCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;
