import { connectToDatabase } from "@/lib/db/connect";
import { WebhookEndpoint } from "@/lib/db/models/WebhookEndpoint";
import { WebhookDelivery } from "@/lib/db/models/WebhookDelivery";
import { generateToken } from "@/lib/auth/tokens";
import { paginate } from "@/lib/db/queryHelpers";
import type { WebhookEventType } from "@/lib/webhooks/events";

export type CreateWebhookEndpointInput = {
  businessId: string;
  url: string;
  eventTypes: WebhookEventType[];
  createdByUserId: string;
};

/** Returns the raw secret exactly once, same one-time-reveal pattern as API keys/payment links —
 * unlike those, this secret IS the persisted value (see WebhookEndpoint.ts's doc comment), so it's
 * returned here for display purposes only; the caller must not assume it can be re-derived later. */
export async function createWebhookEndpoint(
  input: CreateWebhookEndpointInput,
): Promise<{ endpoint: InstanceType<typeof WebhookEndpoint>; secret: string }> {
  await connectToDatabase();
  const secret = generateToken();
  const endpoint = await WebhookEndpoint.create({
    businessId: input.businessId,
    url: input.url,
    secret,
    eventTypes: input.eventTypes,
    createdByUserId: input.createdByUserId,
  });
  return { endpoint, secret };
}

export async function listWebhookEndpoints(businessId: string) {
  await connectToDatabase();
  return WebhookEndpoint.find({ businessId }).sort({ createdAt: -1 }).lean();
}

export async function findWebhookEndpointById(webhookEndpointId: string, businessId: string) {
  await connectToDatabase();
  return WebhookEndpoint.findOne({ _id: webhookEndpointId, businessId });
}

/** Active endpoints subscribed to a given event, for a given business — the dispatch fan-out
 * query (lib/webhooks/dispatch.ts). */
export async function findActiveEndpointsForEvent(businessId: string, eventType: WebhookEventType) {
  await connectToDatabase();
  return WebhookEndpoint.find({ businessId, isActive: true, eventTypes: eventType });
}

export type UpdateWebhookEndpointInput = {
  url?: string;
  eventTypes?: WebhookEventType[];
  isActive?: boolean;
};

export async function updateWebhookEndpoint(
  webhookEndpointId: string,
  businessId: string,
  updates: UpdateWebhookEndpointInput,
) {
  await connectToDatabase();
  return WebhookEndpoint.findOneAndUpdate(
    { _id: webhookEndpointId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function deleteWebhookEndpoint(webhookEndpointId: string, businessId: string) {
  await connectToDatabase();
  const result = await WebhookEndpoint.deleteOne({ _id: webhookEndpointId, businessId });
  return result.deletedCount > 0;
}

export type RecordDeliveryInput = {
  businessId: string;
  webhookEndpointId: string;
  eventType: string;
  payload: unknown;
  status: "success" | "failed";
  attempts: number;
  lastResponseStatus?: number;
  lastError?: string;
};

export async function recordWebhookDelivery(input: RecordDeliveryInput) {
  await connectToDatabase();
  return WebhookDelivery.create({
    businessId: input.businessId,
    webhookEndpointId: input.webhookEndpointId,
    eventType: input.eventType,
    payload: input.payload,
    status: input.status,
    attempts: input.attempts,
    lastAttemptAt: new Date(),
    lastResponseStatus: input.lastResponseStatus,
    lastError: input.lastError,
  });
}

export async function listWebhookDeliveries(
  webhookEndpointId: string,
  businessId: string,
  params: { page?: number } = {},
) {
  await connectToDatabase();
  return paginate(
    WebhookDelivery,
    { businessId, webhookEndpointId },
    { ...params, sort: { createdAt: -1 } },
  );
}

export async function findWebhookDeliveryById(webhookDeliveryId: string, businessId: string) {
  await connectToDatabase();
  return WebhookDelivery.findOne({ _id: webhookDeliveryId, businessId });
}
