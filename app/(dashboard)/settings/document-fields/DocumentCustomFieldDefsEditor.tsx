"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/validation/shared";
import { updateDocumentCustomFieldDefsAction, type DocumentFieldsPageState } from "./actions";

type Row = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string;
  required: boolean;
};

const initialState: DocumentFieldsPageState = {};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

/**
 * Per-document-type custom header fields (e.g. a travel agency's "Journey Start Date" on
 * Invoices) — a different store from the Company Details custom fields editor this mirrors
 * (app/(dashboard)/settings/company/CustomFieldDefsEditor.tsx). `docType` selects which of
 * Business.documentCustomFieldDefs's per-type buckets this instance edits/saves.
 */
export function DocumentCustomFieldDefsEditor({
  docType,
  defaultDefs,
}: {
  docType: string;
  defaultDefs: Array<{
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[];
    required: boolean;
  }>;
}) {
  const [state, formAction] = useActionState(updateDocumentCustomFieldDefsAction, initialState);
  const [rows, setRows] = useState<Row[]>(
    defaultDefs.map((d) => ({ ...d, options: d.options.join(", ") })),
  );

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", label: "", type: "text", options: "", required: false }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="docType" value={docType} />
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-12">
            <label className="block text-xs sm:col-span-3">
              <span className="mb-1 block font-medium text-muted-foreground">Key</span>
              <input
                name={`documentField__${i}__key`}
                value={row.key}
                onChange={(e) => updateRow(i, { key: e.target.value })}
                placeholder="journey_start_date"
                className={fieldClass}
              />
            </label>
            <label className="block text-xs sm:col-span-3">
              <span className="mb-1 block font-medium text-muted-foreground">Label</span>
              <input
                name={`documentField__${i}__label`}
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Journey Start Date"
                className={fieldClass}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-1 block font-medium text-muted-foreground">Type</span>
              <select
                name={`documentField__${i}__type`}
                value={row.type}
                onChange={(e) => updateRow(i, { type: e.target.value as CustomFieldType })}
                className={fieldClass}
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs sm:col-span-3">
              <span className="mb-1 block font-medium text-muted-foreground">Options (if select)</span>
              <input
                name={`documentField__${i}__options`}
                value={row.options}
                onChange={(e) => updateRow(i, { options: e.target.value })}
                placeholder="Comma, separated"
                disabled={row.type !== "select"}
                className={fieldClass}
              />
            </label>
            <div className="flex items-center justify-between sm:col-span-1">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  name={`documentField__${i}__required`}
                  checked={row.required}
                  onCheckedChange={(checked) => updateRow(i, { required: checked === true })}
                />
                Req.
              </label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(i)}
              className="justify-self-start text-destructive hover:text-destructive sm:col-span-12"
            >
              <X data-icon="inline-start" />
              Remove field
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          + Add field
        </Button>
        <div className="max-w-xs">
          <SubmitButton pendingText="Saving…">Save custom fields</SubmitButton>
        </div>
      </div>
    </form>
  );
}
