import { findActiveEndpointsForEvent } from "@/lib/db/queries/webhooks";
import { deliverWebhookEvent } from "@/lib/webhooks/deliver";
import type { WebhookEventType } from "@/lib/webhooks/events";

/**
 * Fires an event to every active endpoint a business has subscribed to it. Called in-process right
 * after the triggering write's transaction has committed — never from inside the transaction
 * itself, since an outbound HTTP call must never be able to abort or block a database write.
 * Never throws: a webhook failure must never surface as a failure of the action that triggered it.
 */
export async function fireWebhookEvent(
  businessId: string,
  eventType: WebhookEventType,
  data: unknown,
): Promise<void> {
  try {
    const endpoints = await findActiveEndpointsForEvent(businessId, eventType);
    if (endpoints.length === 0) return;
    await Promise.allSettled(endpoints.map((endpoint) => deliverWebhookEvent(endpoint, eventType, data)));
  } catch (err) {
    console.error("fireWebhookEvent failed", err);
  }
}
