"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteWebhookEndpointAction, type WebhookActionState } from "./actions";

const initialState: WebhookActionState = {};

export function DeleteWebhookEndpointButton({ webhookEndpointId }: { webhookEndpointId: string }) {
  const [state, formAction] = useActionState(deleteWebhookEndpointAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="webhookEndpointId" value={webhookEndpointId} />
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
      {state.error ? <span className="max-w-40 text-right text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
