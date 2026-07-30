"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { importBankStatementAction, type ImportState } from "./actions";

const initialState: ImportState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Import
    </Button>
  );
}

export function ImportForm({ bankAccountId }: { bankAccountId: string }) {
  const [state, formAction] = useActionState(importBankStatementAction, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <Card>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="file">CSV file</FieldLabel>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
          </Field>
          <p className="text-xs text-muted-foreground">
            Required columns: <code>statementDate</code> (YYYY-MM-DD), <code>amountMinor</code> (e.g.
            &quot;1250.00&quot;), <code>direction</code> (credit/debit). Optional: <code>description</code>.
          </p>
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
