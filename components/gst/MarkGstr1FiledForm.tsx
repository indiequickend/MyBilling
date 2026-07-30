"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  markGstr1FiledAction,
  unmarkGstr1FiledAction,
  type GstActionState,
} from "@/app/(dashboard)/gst/gstr1/actions";

const initialState: GstActionState = {};

function SubmitButton({ label, variant }: { label: string; variant?: "outline" | "default" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant ?? "default"} disabled={pending}>
      {label}
    </Button>
  );
}

export function MarkGstr1FiledForm({ period, filed }: { period: string; filed: boolean }) {
  const action = filed ? unmarkGstr1FiledAction : markGstr1FiledAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="period" value={period} />
      <SubmitButton label={filed ? "Unmark as Filed" : "Mark as Filed"} variant={filed ? "outline" : "default"} />
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}
