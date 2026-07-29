"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelPurchaseOrderAction,
  softDeletePurchaseOrderAction,
  type PurchaseOrderActionState,
} from "../actions";

const initialState: PurchaseOrderActionState = {};

function ActionSubmitButton({
  variant,
  icon: Icon,
  pendingLabel,
  children,
}: {
  variant: "outline" | "destructive";
  icon: React.ComponentType<{ className?: string }>;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function CancelPurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [state, formAction] = useActionState(cancelPurchaseOrderAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <ActionSubmitButton variant="outline" icon={XCircle} pendingLabel="Cancelling…">
        Cancel order
      </ActionSubmitButton>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function DeletePurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [state, formAction] = useActionState(softDeletePurchaseOrderAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <ActionSubmitButton variant="destructive" icon={Trash2} pendingLabel="Deleting…">
        Delete
      </ActionSubmitButton>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
