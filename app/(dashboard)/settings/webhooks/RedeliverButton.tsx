"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { redeliverWebhookAction, type WebhookActionState } from "./actions";

const initialState: WebhookActionState = {};

export function RedeliverButton({
  webhookEndpointId,
  webhookDeliveryId,
}: {
  webhookEndpointId: string;
  webhookDeliveryId: string;
}) {
  const [state, formAction] = useActionState(redeliverWebhookAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="webhookEndpointId" value={webhookEndpointId} />
      <input type="hidden" name="webhookDeliveryId" value={webhookDeliveryId} />
      <Button type="submit" variant="outline" size="sm">
        Redeliver
      </Button>
      {state.error ? <span className="max-w-40 text-right text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
