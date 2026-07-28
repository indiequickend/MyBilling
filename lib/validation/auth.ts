import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Password must include upper case, lower case, and a number",
  });

export const setupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email,
  password,
  businessName: z.string().trim().min(1, "Business name is required").max(200),
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpChallengeSchema = z.object({
  // Either a 6-digit TOTP code or a backup code like "a1b2c-d3e4f".
  code: z.string().trim().min(6).max(20),
});
export type TotpChallengeInput = z.infer<typeof totpChallengeSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteExistingUserSchema = z.object({
  token: z.string().min(1),
});

export const acceptInviteNewUserSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  password,
});
export type AcceptInviteNewUserInput = z.infer<typeof acceptInviteNewUserSchema>;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
