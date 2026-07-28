"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
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

/**
 * Per-document-type custom header fields for Invoices (e.g. a travel agency's "Journey Start
 * Date") — a different store from the Company Details custom fields editor this mirrors
 * (app/(dashboard)/settings/company/CustomFieldDefsEditor.tsx). Only "invoice" is wired up this
 * phase; the underlying store is already keyed by document type for later phases to reuse.
 */
export function DocumentCustomFieldDefsEditor({
  defaultDefs,
}: {
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
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-12 items-end gap-2 rounded-md border border-slate-200 p-3"
          >
            <label className="col-span-3 block text-xs">
              <span className="mb-1 block font-medium text-slate-700">Key</span>
              <input
                name={`documentField__${i}__key`}
                value={row.key}
                onChange={(e) => updateRow(i, { key: e.target.value })}
                placeholder="journey_start_date"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="col-span-3 block text-xs">
              <span className="mb-1 block font-medium text-slate-700">Label</span>
              <input
                name={`documentField__${i}__label`}
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Journey Start Date"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="col-span-2 block text-xs">
              <span className="mb-1 block font-medium text-slate-700">Type</span>
              <select
                name={`documentField__${i}__type`}
                value={row.type}
                onChange={(e) => updateRow(i, { type: e.target.value as CustomFieldType })}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-3 block text-xs">
              <span className="mb-1 block font-medium text-slate-700">Options (if select)</span>
              <input
                name={`documentField__${i}__options`}
                value={row.options}
                onChange={(e) => updateRow(i, { options: e.target.value })}
                placeholder="Comma, separated"
                disabled={row.type !== "select"}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
              />
            </label>
            <div className="col-span-1 flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  name={`documentField__${i}__required`}
                  checked={row.required}
                  onChange={(e) => updateRow(i, { required: e.target.checked })}
                />
                Req.
              </label>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="col-span-12 justify-self-start text-xs text-red-600 hover:underline"
            >
              Remove field
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          + Add field
        </button>
        <div className="max-w-xs">
          <SubmitButton pendingText="Saving…">Save custom fields</SubmitButton>
        </div>
      </div>
    </form>
  );
}
