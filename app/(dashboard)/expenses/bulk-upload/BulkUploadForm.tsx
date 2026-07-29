"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { bulkUploadExpensesAction, type BulkUploadState } from "./actions";

const initialState: BulkUploadState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Upload
    </Button>
  );
}

export function BulkUploadForm() {
  const [state, formAction] = useActionState(bulkUploadExpensesAction, initialState);

  return (
    <form action={formAction} encType="multipart/form-data" className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="file">CSV file</FieldLabel>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
          </Field>
          <SubmitButton />
        </CardContent>
      </Card>

      {state.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {state.rowErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state.success ? (
        <div className="rounded-lg border border-accent-mint/30 bg-accent-mint/10 p-4 text-sm text-accent-mint-foreground">
          {state.success}
        </div>
      ) : null}
    </form>
  );
}
