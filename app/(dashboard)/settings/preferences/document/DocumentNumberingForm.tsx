"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants/documentTypes";
import type { DocumentNumberingConfigInput } from "@/lib/validation/preferences";
import { updateDocumentNumberingAction, type PreferencesPageState } from "../actions";

const initialState: PreferencesPageState = {};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type NumberingConfig = Partial<DocumentNumberingConfigInput> &
  Pick<DocumentNumberingConfigInput, "prefix" | "padding" | "resetPolicy">;

function DocumentTypeNumbering({ type, config }: { type: DocumentType; config: NumberingConfig }) {
  return (
    <FieldSet className="rounded-lg border p-4">
      <FieldLegend variant="label">{DOCUMENT_TYPE_LABELS[type]} numbering</FieldLegend>
      <FieldGroup className="max-w-xs gap-3">
        <FormField label="Prefix" name={`${type}__prefix`} defaultValue={config.prefix} />
        <FormField
          label="Number padding"
          name={`${type}__padding`}
          type="number"
          defaultValue={String(config.padding)}
        />
        <Field>
          <FieldLabel htmlFor={`${type}__resetPolicy`}>Reset</FieldLabel>
          <SelectField
            name={`${type}__resetPolicy`}
            defaultValue={config.resetPolicy}
            placeholder="Reset policy"
            options={[
              { value: "fiscal_year", label: "Every fiscal year" },
              { value: "never", label: "Never (one continuous series)" },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${type}__fyLabelStyle`}>Fiscal year label</FieldLabel>
          <SelectField
            name={`${type}__fyLabelStyle`}
            defaultValue={config.fyLabelStyle ?? "long"}
            placeholder="Label style"
            options={[
              { value: "long", label: "2026-27" },
              { value: "short", label: "26-27" },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${type}__separator`}>Separator before the number</FieldLabel>
          <SelectField
            name={`${type}__separator`}
            defaultValue={config.separator ?? "-"}
            placeholder="Separator"
            options={[
              { value: "-", label: "Hyphen ( - )" },
              { value: "/", label: "Slash ( / )" },
              { value: "_", label: "Underscore ( _ )" },
              { value: ".", label: "Dot ( . )" },
            ]}
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

export function DocumentNumberingForm({
  fyStartMonth,
  configs,
}: {
  fyStartMonth: number;
  configs: Record<string, NumberingConfig>;
}) {
  const [state, formAction] = useActionState(updateDocumentNumberingAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label">Fiscal year</FieldLegend>
        <FieldGroup className="max-w-xs gap-3">
          <Field>
            <FieldLabel htmlFor="fyStartMonth">Fiscal year starts in</FieldLabel>
            <SelectField
              name="fyStartMonth"
              defaultValue={String(fyStartMonth)}
              placeholder="Month"
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      {/* forceMount keeps every tab's fields in the DOM (inactive ones just hidden), so one Save
          submits all document types' settings together. */}
      <Tabs defaultValue={DOCUMENT_TYPES[0]}>
        <TabsList variant="line" className="h-auto flex-wrap justify-start">
          {DOCUMENT_TYPES.map((type) => (
            <TabsTrigger key={type} value={type} className="flex-none px-3 py-1.5">
              {DOCUMENT_TYPE_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>
        {DOCUMENT_TYPES.map((type) => (
          <TabsContent key={type} value={type} forceMount className="mt-3 data-[state=inactive]:hidden">
            <DocumentTypeNumbering type={type} config={configs[type]} />
          </TabsContent>
        ))}
      </Tabs>

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">Save numbering settings</SubmitButton>
      </div>
    </form>
  );
}
