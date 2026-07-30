"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Copy, Check } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { PAYMENT_LINK_EXPIRY_OPTIONS } from "@/lib/validation/paymentLinks";
import { createPaymentLinkAction, type PaymentLinkFormState } from "./actions";

const initialState: PaymentLinkFormState = {};

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Generate link
    </Button>
  );
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
      <code className="flex-1 truncate text-sm">{url}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(url);
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

export function PaymentLinkForm({ invoices }: { invoices: Array<{ id: string; label: string }> }) {
  const [state, formAction] = useActionState(createPaymentLinkAction, initialState);

  if (state.url) {
    return (
      <Card className="max-w-lg">
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share this link — it works without the recipient logging in, and stops working after it
            expires.
          </p>
          <CopyableUrl url={state.url} />
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      <Card>
        <CardContent>
          <FieldGroup>
            <FormField
              label="Amount (₹)"
              name="amountMinor"
              type="number"
              required
              error={state.fieldErrors?.amountMinor}
            />
            <Field data-invalid={state.fieldErrors?.linkedInvoiceId ? true : undefined}>
              <FieldLabel htmlFor="linkedInvoiceId">Against invoice (optional)</FieldLabel>
              <select
                id="linkedInvoiceId"
                name="linkedInvoiceId"
                defaultValue=""
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">None</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.label}
                  </option>
                ))}
              </select>
              <FieldError>{state.fieldErrors?.linkedInvoiceId}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="expiresInDays">Expires in</FieldLabel>
              <select
                id="expiresInDays"
                name="expiresInDays"
                defaultValue="7"
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {PAYMENT_LINK_EXPIRY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === "1" ? "" : "s"}
                  </option>
                ))}
              </select>
            </Field>
            <FormField label="Note (optional)" name="note" error={state.fieldErrors?.note} />
          </FieldGroup>
        </CardContent>
      </Card>
      <CreateButton />
    </form>
  );
}
