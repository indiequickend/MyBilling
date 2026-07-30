/** The documented outbound webhook event set (project_spec.md: "invoice created, payment
 * received, document status changed"). Adding a new event type: append it here, then call
 * fireWebhookEvent(...) from the relevant lib/db/queries/* write path — dispatch/delivery/UI
 * (event checkboxes) all read from this one list, no other file needs to change. */
export const WEBHOOK_EVENT_TYPES = [
  "invoice.created",
  "invoice.payment_received",
  "invoice.status_changed",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  "invoice.created": "Invoice created",
  "invoice.payment_received": "Invoice payment received",
  "invoice.status_changed": "Invoice status changed",
};
