"use client";

import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { SelectField } from "@/components/ui/SelectField";
import { Textarea } from "@/components/ui/textarea";

/** Keep in sync with the notes/terms caps in lib/validation/* and the template body cap in
 * lib/validation/noteTermTemplates.ts — a template body must always fit in the document field. */
export const NOTE_TERM_MAX_LENGTH = 5000;

export type NoteTermTemplateOption = { id: string; label: string; body?: string };

/**
 * The Notes/Terms block shared by every document form: a template picker per field plus the text
 * itself. Picking a template copies its body into the matching text field (the document stores
 * text, not a live reference, so PDFs/views print exactly what's in the field); the id is kept
 * only as a back-reference. Validation errors for all four inputs are shown here — they used to
 * be silently dropped, leaving only a generic "Fix the errors below" banner.
 */
export function NoteTermFields({
  noteTemplates,
  termTemplates,
  defaultValues,
  errors,
}: {
  noteTemplates: NoteTermTemplateOption[];
  termTemplates: NoteTermTemplateOption[];
  defaultValues?: { noteTemplateId?: string; termTemplateId?: string; notes?: string; terms?: string };
  errors?: Partial<Record<"noteTemplateId" | "termTemplateId" | "notes" | "terms", string>>;
}) {
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [terms, setTerms] = useState(defaultValues?.terms ?? "");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={errors?.noteTemplateId ? true : undefined}>
          <FieldLabel htmlFor="noteTemplateId">Notes template</FieldLabel>
          <SelectField
            name="noteTemplateId"
            defaultValue={defaultValues?.noteTemplateId}
            placeholder="None"
            options={[{ value: "", label: "None" }, ...noteTemplates.map((t) => ({ value: t.id, label: t.label }))]}
            onValueChange={(id) => {
              const body = noteTemplates.find((t) => t.id === id)?.body;
              if (body !== undefined) setNotes(body);
            }}
          />
          {errors?.noteTemplateId ? <p className="text-destructive text-sm">{errors.noteTemplateId}</p> : null}
        </Field>
        <Field data-invalid={errors?.termTemplateId ? true : undefined}>
          <FieldLabel htmlFor="termTemplateId">Terms template</FieldLabel>
          <SelectField
            name="termTemplateId"
            defaultValue={defaultValues?.termTemplateId}
            placeholder="None"
            options={[{ value: "", label: "None" }, ...termTemplates.map((t) => ({ value: t.id, label: t.label }))]}
            onValueChange={(id) => {
              const body = termTemplates.find((t) => t.id === id)?.body;
              if (body !== undefined) setTerms(body);
            }}
          />
          {errors?.termTemplateId ? <p className="text-destructive text-sm">{errors.termTemplateId}</p> : null}
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field data-invalid={errors?.notes ? true : undefined}>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={NOTE_TERM_MAX_LENGTH}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {errors?.notes ? <p className="text-destructive text-sm">{errors.notes}</p> : null}
        </Field>
        <Field data-invalid={errors?.terms ? true : undefined}>
          <FieldLabel htmlFor="terms">Terms</FieldLabel>
          <Textarea
            id="terms"
            name="terms"
            rows={3}
            maxLength={NOTE_TERM_MAX_LENGTH}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
          {errors?.terms ? <p className="text-destructive text-sm">{errors.terms}</p> : null}
        </Field>
      </div>
    </>
  );
}
