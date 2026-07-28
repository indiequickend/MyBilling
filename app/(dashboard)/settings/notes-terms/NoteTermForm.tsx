"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
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
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Document type</span>
          <select
            name="docType"
            defaultValue={defaultValues?.docType ?? "invoice"}
            disabled={mode === "edit"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {mode === "edit" ? <input type="hidden" name="docType" value={defaultValues?.docType} /> : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Kind</span>
          <select
            name="kind"
            defaultValue={defaultValues?.kind ?? "term"}
            disabled={mode === "edit"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="note">Note</option>
            <option value="term">Term</option>
          </select>
          {mode === "edit" ? <input type="hidden" name="kind" value={defaultValues?.kind} /> : null}
        </label>
      </div>

      <FormField
        label="Title (optional)"
        name="title"
        defaultValue={defaultValues?.title}
        error={state.fieldErrors?.title}
      />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Body</span>
        <textarea
          name="body"
          required
          rows={5}
          defaultValue={defaultValues?.body}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
        />
        {state.fieldErrors?.body ? (
          <span role="alert" className="mt-1 block text-xs text-red-600">
            {state.fieldErrors.body}
          </span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        Active
      </label>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Add template" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
