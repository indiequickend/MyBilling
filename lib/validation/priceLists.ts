import { z } from "zod";
import { optionalTrimmed } from "@/lib/validation/shared";

export const priceListSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: optionalTrimmed(500),
});
export type PriceListInput = z.infer<typeof priceListSchema>;
