import { z } from "zod";

export const partyGroupSchema = z.object({
  type: z.enum(["customer", "vendor"]),
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type PartyGroupInput = z.infer<typeof partyGroupSchema>;
