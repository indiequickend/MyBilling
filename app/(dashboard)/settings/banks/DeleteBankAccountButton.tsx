"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { softDeleteBankAccountAction, type DeleteBankAccountState } from "./actions";

const initialState: DeleteBankAccountState = {};

/** A plain `<form action>` can't surface the "in_use" guard's message — this needs client state. */
export function DeleteBankAccountButton({ bankAccountId }: { bankAccountId: string }) {
  const [state, formAction] = useActionState(softDeleteBankAccountAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
      {state.error ? <span className="max-w-40 text-right text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
