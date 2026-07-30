"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { JournalLinesEditor, type JournalLineRow } from "./JournalLinesEditor";
import { createJournalAction, type JournalFormState } from "./actions";

const initialState: JournalFormState = {};

const BLANK_LINE: JournalLineRow = {
  accountType: "",
  accountRefId: "",
  accountLabel: "",
  side: "debit",
  amount: "",
  note: "",
};

export function JournalForm({
  bankAccounts,
  customers,
  vendors,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(createJournalAction, initialState);

  // React 19 resets a form's DOM controls after every non-redirecting Server Action call. That
  // desyncs the controlled <select>s in JournalLinesEditor (visually reset while the underlying
  // `lines` state — and therefore what would actually be resubmitted — is untouched), the same
  // class of bug fixed in Phase 6's StockMovementForm. Forcing a full remount of the fields on
  // every action result keeps the visible DOM consistent with a clean initial state instead of
  // a misleading partial reset.
  const [renderKey, setRenderKey] = useState(0);
  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current !== state) {
      lastState.current = state;
      setRenderKey((k) => k + 1);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      <JournalFormFields
        key={renderKey}
        fieldErrors={state.fieldErrors}
        bankAccounts={bankAccounts}
        customers={customers}
        vendors={vendors}
      />

      <SaveButton />
    </form>
  );
}

function JournalFormFields({
  fieldErrors,
  bankAccounts,
  customers,
  vendors,
}: {
  fieldErrors?: Record<string, string>;
  bankAccounts: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [lines, setLines] = useState<JournalLineRow[]>([{ ...BLANK_LINE }, { ...BLANK_LINE, side: "credit" }]);

  return (
    <>
      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Journal date"
                name="journalDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                error={fieldErrors?.journalDate}
              />
            </div>
            <Field>
              <FieldLabel htmlFor="narration">Narration</FieldLabel>
              <Textarea id="narration" name="narration" rows={2} required />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalLinesEditor
            rows={lines}
            onChange={setLines}
            bankAccounts={bankAccounts}
            customers={customers}
            vendors={vendors}
          />
        </CardContent>
      </Card>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Save journal
    </Button>
  );
}
