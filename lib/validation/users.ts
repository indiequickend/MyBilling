import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  roleId: objectId,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeMembershipRoleSchema = z.object({
  roleId: objectId,
});
export type ChangeMembershipRoleInput = z.infer<typeof changeMembershipRoleSchema>;

export const changeMembershipStatusSchema = z.object({
  status: z.enum(["active", "deactivated"]),
});
export type ChangeMembershipStatusInput = z.infer<typeof changeMembershipStatusSchema>;
