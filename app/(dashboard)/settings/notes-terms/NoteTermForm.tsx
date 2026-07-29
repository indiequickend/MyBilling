"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/auth/AuthCard";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
import {
  createNoteTermTemplateAction,
  updateNoteTermTemplateAction,
  type NoteTermFormState,
} from "./actions";

const initialState: NoteTermFormState = {};

export function NoteTermForm({
  mode,
  templateId,
  defaultValues,
}: {
  mode: "create" | "edit";
  templateId?: string;
  defaultValues?: {
    docType: string;
    kind: "note" | "term";
    title: string;
    body: string;
    isActive: boolean;
  };
}) {
  const action = mode === "create" ? createNoteTermTemplateAction : updateNoteTermTemplateAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {templateId ? <input type="hidden" name="templateId" value={templateId} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="docType">Document type</FieldLabel>
          {mode === "edit" ? (
            <>
              <input
                readOnly
                disabled
                value={DOCUMENT_TYPE_LABELS[defaultValues?.docType as keyof typeof DOCUMENT_TYPE_LABELS] ?? ""}
                className="h-8 w-full rounded-lg border border-input bg-input/50 px-2.5 text-sm text-muted-foreground"
              />
              <input type="hidden" name="docType" value={defaultValues?.docType} />
            </>
          ) : (
            <SelectField
              name="docType"
              defaultValue={defaultValues?.docType ?? "invoice"}
              placeholder="Document type"
              options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
            />
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="kind">Kind</FieldLabel>
          {mode === "edit" ? (
            <>
              <input
                readOnly
                disabled
                value={defaultValues?.kind === "note" ? "Note" : "Term"}
                className="h-8 w-full rounded-lg border border-input bg-input/50 px-2.5 text-sm text-muted-foreground capitalize"
              />
              <input type="hidden" name="kind" value={defaultValues?.kind} />
            </>
          ) : (
            <SelectField
              name="kind"
              defaultValue={defaultValues?.kind ?? "term"}
              placeholder="Kind"
              options={[
                { value: "note", label: "Note" },
                { value: "term", label: "Term" },
              ]}
            />
          )}
        </Field>
      </div>

      <FormField
        label="Title (optional)"
        name="title"
        defaultValue={defaultValues?.title}
        error={state.fieldErrors?.title}
      />

      <Field data-invalid={state.fieldErrors?.body ? true : undefined}>
        <FieldLabel htmlFor="body">Body</FieldLabel>
        <Textarea id="body" name="body" required rows={5} defaultValue={defaultValues?.body} />
        <FieldError>{state.fieldErrors?.body}</FieldError>
      </Field>

      <Field orientation="horizontal">
        <Checkbox name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <FieldLabel className="font-normal">Active</FieldLabel>
      </Field>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Add template" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
