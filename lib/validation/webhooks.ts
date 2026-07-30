import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/events";

export const webhookEndpointSchema = z.object({
  url: z.string().trim().url("Enter a valid URL"),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, "Select at least one event"),
});
export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;
