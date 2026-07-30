"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { webhookEndpointSchema } from "@/lib/validation/webhooks";
import type { WebhookEventType } from "@/lib/webhooks/events";
import {
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  findWebhookEndpointById,
  findWebhookDeliveryById,
} from "@/lib/db/queries/webhooks";
import { redeliverWebhookPayload } from "@/lib/webhooks/deliver";

export type WebhookFormState = { error?: string; fieldErrors?: Record<string, string>; secret?: string };
export type WebhookActionState = { error?: string };

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

export async function createWebhookEndpointAction(
  _prev: WebhookFormState,
  formData: FormData,
): Promise<WebhookFormState> {
  const context = await requireIntegrationsPermission();

  const parsed = webhookEndpointSchema.safeParse({
    url: formData.get("url"),
    eventTypes: formData.getAll("eventTypes"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { secret } = await createWebhookEndpoint({
    businessId: context.activeBusinessId,
    url: parsed.data.url,
    eventTypes: parsed.data.eventTypes as WebhookEventType[],
    createdByUserId: context.userId,
  });

  revalidatePath("/settings/webhooks");
  return { secret };
}

export async function updateWebhookEndpointAction(
  _prev: WebhookFormState,
  formData: FormData,
): Promise<WebhookFormState> {
  const context = await requireIntegrationsPermission();
  const webhookEndpointId = String(formData.get("webhookEndpointId") ?? "");

  const parsed = webhookEndpointSchema.safeParse({
    url: formData.get("url"),
    eventTypes: formData.getAll("eventTypes"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await updateWebhookEndpoint(webhookEndpointId, context.activeBusinessId, {
    url: parsed.data.url,
    eventTypes: parsed.data.eventTypes as WebhookEventType[],
  });

  revalidatePath("/settings/webhooks");
  redirect(`/settings/webhooks/${webhookEndpointId}`);
}

export async function toggleWebhookEndpointActiveAction(formData: FormData): Promise<void> {
  const context = await requireIntegrationsPermission();
  const webhookEndpointId = String(formData.get("webhookEndpointId") ?? "");
  const isActive = formData.get("isActive") === "true";
  if (!webhookEndpointId) return;
  await updateWebhookEndpoint(webhookEndpointId, context.activeBusinessId, { isActive: !isActive });
  revalidatePath("/settings/webhooks");
  revalidatePath(`/settings/webhooks/${webhookEndpointId}`);
}

export async function deleteWebhookEndpointAction(
  _prev: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const context = await requireIntegrationsPermission();
  const webhookEndpointId = String(formData.get("webhookEndpointId") ?? "");
  const deleted = await deleteWebhookEndpoint(webhookEndpointId, context.activeBusinessId);
  if (!deleted) return { error: "Webhook not found." };
  revalidatePath("/settings/webhooks");
  redirect("/settings/webhooks");
}

export async function redeliverWebhookAction(
  _prev: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const context = await requireIntegrationsPermission();
  const webhookEndpointId = String(formData.get("webhookEndpointId") ?? "");
  const webhookDeliveryId = String(formData.get("webhookDeliveryId") ?? "");

  const endpoint = await findWebhookEndpointById(webhookEndpointId, context.activeBusinessId);
  if (!endpoint) return { error: "Webhook not found." };
  const delivery = await findWebhookDeliveryById(webhookDeliveryId, context.activeBusinessId);
  if (!delivery) return { error: "Delivery not found." };

  await redeliverWebhookPayload(endpoint, delivery.eventType, delivery.payload);
  revalidatePath(`/settings/webhooks/${webhookEndpointId}`);
  return {};
}
