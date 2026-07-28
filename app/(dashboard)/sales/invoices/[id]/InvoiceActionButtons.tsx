"use client";

import { useActionState } from "react";
import { cancelInvoiceAction, softDeleteInvoiceAction, type InvoiceActionState } from "../actions";

const initialState: InvoiceActionState = {};

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState(cancelInvoiceAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Cancel invoice
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export function DeleteInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState(softDeleteInvoiceAction, initialState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
