"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/context";
import { findMembership } from "@/lib/db/queries/memberships";
import { setActiveBusinessIdCookie } from "@/lib/auth/activeBusiness";
import { createBusinessSchema } from "@/lib/validation/auth";
import { createBusinessWithOwner } from "@/lib/db/queries/businesses";

export async function switchBusinessAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const businessId = String(formData.get("businessId") ?? "");
  if (businessId) {
    const membership = await findMembership(String(user._id), businessId);
    if (membership && membership.status === "active") {
      await setActiveBusinessIdCookie(businessId);
    }
  }
  redirect("/");
}

export type CreateBusinessState = { error?: string };

export async function createBusinessAction(
  _prev: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createBusinessSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createBusinessWithOwner({
    name: parsed.data.name,
    ownerUserId: String(user._id),
  });
  await setActiveBusinessIdCookie(result.businessId);
  redirect("/");
}
