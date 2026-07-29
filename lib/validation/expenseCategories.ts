import { z } from "zod";

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;
