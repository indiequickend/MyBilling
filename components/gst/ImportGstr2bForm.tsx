"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { importGstr2bAction, type Gstr2bImportState } from "@/app/(dashboard)/gst/gstr2b/actions";

const initialState: Gstr2bImportState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importing…" : "Import"}
    </Button>
  );
}

export function ImportGstr2bForm({ period }: { period: string }) {
  const [state, formAction] = useActionState(importGstr2bAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="period" value={period} />
      <div>
        <label htmlFor="gstr2b-file" className="mb-1 block text-xs text-muted-foreground">
          GSTR-2B JSON export
        </label>
        <input
          id="gstr2b-file"
          name="file"
          type="file"
          accept="application/json,.json"
          required
          className="text-sm"
        />
      </div>
      <SubmitButton />
      {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
