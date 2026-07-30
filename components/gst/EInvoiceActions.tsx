"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  generateEInvoiceDataAction,
  overrideEInvoiceStatusAction,
  type GstActionState,
} from "@/app/(dashboard)/gst/e-invoices/[invoiceId]/actions";

const initialState: GstActionState = {};

function SubmitButton({ label, variant }: { label: string; variant?: "outline" | "default" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant ?? "default"} disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function GenerateEInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState(generateEInvoiceDataAction, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton label="Generate / Validate" />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}

export function EInvoiceStatusOverrideForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState(overrideEInvoiceStatusAction, initialState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="status" value="cancelled" />
      <SubmitButton label="Mark Cancelled" variant="outline" />
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}
