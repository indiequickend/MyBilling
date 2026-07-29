"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelSalesOrderAction,
  softDeleteSalesOrderAction,
  type SalesOrderActionState,
} from "../actions";

const initialState: SalesOrderActionState = {};

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

export function CancelSalesOrderButton({ salesOrderId }: { salesOrderId: string }) {
  const [state, formAction] = useActionState(cancelSalesOrderAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <ActionSubmitButton variant="outline" icon={XCircle} pendingLabel="Cancelling…">
        Cancel order
      </ActionSubmitButton>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function DeleteSalesOrderButton({ salesOrderId }: { salesOrderId: string }) {
  const [state, formAction] = useActionState(softDeleteSalesOrderAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <ActionSubmitButton variant="destructive" icon={Trash2} pendingLabel="Deleting…">
        Delete
      </ActionSubmitButton>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
