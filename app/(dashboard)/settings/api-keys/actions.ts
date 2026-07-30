"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { apiKeySchema } from "@/lib/validation/apiKeys";
import { createApiKey, revokeApiKey } from "@/lib/db/queries/apiKeys";

export type ApiKeyFormState = { error?: string; fieldErrors?: Record<string, string>; rawKey?: string };
export type ApiKeyActionState = { error?: string };

async function requireIntegrationsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_integrations");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function createApiKeyAction(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  const context = await requireIntegrationsPermission();

  const parsed = apiKeySchema.safeParse({
    name: formData.get("name"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { rawKey } = await createApiKey({
    businessId: context.activeBusinessId,
    roleId: parsed.data.roleId,
    name: parsed.data.name,
    createdByUserId: context.userId,
  });

  revalidatePath("/settings/api-keys");
  return { rawKey };
}

export async function revokeApiKeyAction(
  _prev: ApiKeyActionState,
  formData: FormData,
): Promise<ApiKeyActionState> {
  const context = await requireIntegrationsPermission();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  const result = await revokeApiKey(apiKeyId, context.activeBusinessId);
  if (!result.ok) return { error: "API key not found." };
  revalidatePath("/settings/api-keys");
  return {};
}
