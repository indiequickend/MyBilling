"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Copy, Check } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldError } from "@/components/ui/field";
import { WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_LABELS } from "@/lib/webhooks/events";
import {
  createWebhookEndpointAction,
  updateWebhookEndpointAction,
  type WebhookFormState,
} from "./actions";

const initialState: WebhookFormState = {};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}

function CopyableSecret({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
      <code className="flex-1 truncate text-sm">{secret}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(secret);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function WebhookEndpointForm({
  mode,
  webhookEndpointId,
  defaultValues,
}: {
  mode: "create" | "edit";
  webhookEndpointId?: string;
  defaultValues?: { url: string; eventTypes: string[] };
}) {
  const action = mode === "create" ? createWebhookEndpointAction : updateWebhookEndpointAction;
  const [state, formAction] = useActionState(action, initialState);

  if (state.secret) {
    return (
      <Card className="max-w-lg">
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copy this signing secret now — for security, it won&apos;t be shown again. Use it to
            verify the <code>X-Webhook-Signature</code> header on every delivery.
          </p>
          <CopyableSecret secret={state.secret} />
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {webhookEndpointId ? (
        <input type="hidden" name="webhookEndpointId" value={webhookEndpointId} />
      ) : null}
      <Card>
        <CardContent>
          <FieldGroup>
            <FormField
              label="Endpoint URL"
              name="url"
              type="url"
              placeholder="https://example.com/webhooks/mybilling"
              required
              defaultValue={defaultValues?.url}
              error={state.fieldErrors?.url}
            />
            <Field data-invalid={state.fieldErrors?.eventTypes ? true : undefined}>
              <p className="text-sm font-medium">Events</p>
              <div className="space-y-2">
                {WEBHOOK_EVENT_TYPES.map((eventType) => (
                  <label key={eventType} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="eventTypes"
                      value={eventType}
                      defaultChecked={defaultValues?.eventTypes?.includes(eventType) ?? false}
                    />
                    {WEBHOOK_EVENT_LABELS[eventType]}
                  </label>
                ))}
              </div>
              <FieldError>{state.fieldErrors?.eventTypes}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <SaveButton label={mode === "create" ? "Create webhook" : "Save changes"} />
    </form>
  );
}
