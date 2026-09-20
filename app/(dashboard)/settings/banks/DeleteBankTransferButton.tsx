"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteBankTransferAction, type DeleteBankTransferState } from "./actions";

const initialState: DeleteBankTransferState = {};

/** Deleting a transfer removes it from both accounts' balances, so it asks first. */
export function DeleteBankTransferButton({ transferId }: { transferId: string }) {
  const [state, formAction] = useActionState(deleteBankTransferAction, initialState);

  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!window.confirm("Delete this transfer? Both accounts' balances will be recalculated.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="transferId" value={transferId} />
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
      {state.error ? <span className="max-w-40 text-right text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
