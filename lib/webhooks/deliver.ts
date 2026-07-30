import { randomUUID, createHmac } from "node:crypto";
import type { WebhookEndpointDoc } from "@/lib/db/models/WebhookEndpoint";
import { recordWebhookDelivery } from "@/lib/db/queries/webhooks";
import type { WebhookEventType } from "@/lib/webhooks/events";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 750];
const REQUEST_TIMEOUT_MS = 5000;

/**
 * HMAC-SHA256 over the raw JSON body, keyed on the endpoint's own secret — deliberately a
 * separate primitive from lib/auth/tokens.ts's hashToken(), which is keyed on the global
 * SESSION_SECRET and designed for hashing a token for storage, not for signing an arbitrary
 * payload with a per-endpoint key a receiver needs to verify against.
 */
function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptDelivery(url: string, rawBody: string, signature: string, id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": id,
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Timestamp": String(Date.now()),
      },
      body: rawBody,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Delivers one event to one endpoint, synchronously within the caller's request — this app has no
 * background job infrastructure (CLAUDE.md), so "retry-with-backoff" (build_phases.md's Phase 12
 * requirement) means a small, bounded number of immediate retries here, not a scheduled job.
 * Never throws: a dead/slow receiver must never fail or block the request that triggered the
 * event (e.g. creating an invoice). Always writes exactly one WebhookDelivery row.
 */
export async function deliverWebhookEvent(
  endpoint: Pick<WebhookEndpointDoc, "url" | "secret"> & { _id: unknown; businessId: unknown },
  eventType: WebhookEventType,
  data: unknown,
): Promise<void> {
  const id = randomUUID();
  const rawBody = JSON.stringify({ id, type: eventType, createdAt: new Date().toISOString(), data });
  const signature = signPayload(endpoint.secret, rawBody);

  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    try {
      const result = await attemptDelivery(endpoint.url, rawBody, signature, id);
      lastStatus = result.status;
      if (result.ok) {
        await recordWebhookDelivery({
          businessId: String(endpoint.businessId),
          webhookEndpointId: String(endpoint._id),
          eventType,
          payload: JSON.parse(rawBody),
          status: "success",
          attempts,
          lastResponseStatus: lastStatus,
        }).catch(() => {});
        return;
      }
      lastError = `HTTP ${result.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Request failed";
    }
    if (i < MAX_ATTEMPTS - 1) await sleep(BACKOFF_MS[i]);
  }

  await recordWebhookDelivery({
    businessId: String(endpoint.businessId),
    webhookEndpointId: String(endpoint._id),
    eventType,
    payload: JSON.parse(rawBody),
    status: "failed",
    attempts,
    lastResponseStatus: lastStatus,
    lastError,
  }).catch(() => {});
}

/** Re-sends a previously recorded delivery's exact payload on demand — the user-triggered
 * "Redeliver" action, i.e. the retry path for anything that still failed after the in-request
 * attempts above (see app/(dashboard)/settings/webhooks). */
export async function redeliverWebhookPayload(
  endpoint: Pick<WebhookEndpointDoc, "url" | "secret"> & { _id: unknown; businessId: unknown },
  eventType: string,
  payload: unknown,
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(endpoint.secret, rawBody);
  const id = (payload as { id?: string })?.id ?? randomUUID();

  let lastStatus: number | undefined;
  let lastError: string | undefined;
  try {
    const result = await attemptDelivery(endpoint.url, rawBody, signature, id);
    lastStatus = result.status;
    if (result.ok) {
      await recordWebhookDelivery({
        businessId: String(endpoint.businessId),
        webhookEndpointId: String(endpoint._id),
        eventType,
        payload,
        status: "success",
        attempts: 1,
        lastResponseStatus: lastStatus,
      });
      return;
    }
    lastError = `HTTP ${result.status}`;
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Request failed";
  }
  await recordWebhookDelivery({
    businessId: String(endpoint.businessId),
    webhookEndpointId: String(endpoint._id),
    eventType,
    payload,
    status: "failed",
    attempts: 1,
    lastResponseStatus: lastStatus,
    lastError,
  });
}
