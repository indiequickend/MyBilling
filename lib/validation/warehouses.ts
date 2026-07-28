import { z } from "zod";
import { addressSchema } from "@/lib/validation/shared";

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  address: addressSchema.optional(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;
