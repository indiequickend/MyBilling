"use client";

import { useActionState } from "react";
import { softDeleteBankAccountAction, type DeleteBankAccountState } from "./actions";

const initialState: DeleteBankAccountState = {};

/** A plain `<form action>` can't surface the "in_use" guard's message — this needs client state. */
export function DeleteBankAccountButton({ bankAccountId }: { bankAccountId: string }) {
  const [state, formAction] = useActionState(softDeleteBankAccountAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
      {state.error ? <span className="max-w-40 text-right text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
