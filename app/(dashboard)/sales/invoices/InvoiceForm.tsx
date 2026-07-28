"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormField } from "@/components/ui/FormField";
import { FormError } from "@/components/auth/AuthCard";
import { DISCOUNT_TARGETS, DISCOUNT_TARGET_LABELS } from "@/lib/constants/invoices";
import type { CustomFieldType } from "@/lib/validation/shared";
import { LineItemsEditor, BLANK_LINE_ITEM, type LineItemRow } from "./LineItemsEditor";
import { PaymentSplitsEditor } from "./PaymentSplitsEditor";
import { saveInvoiceAction, type InvoiceFormState } from "./actions";

const initialState: InvoiceFormState = {};

function SubmitIntentButton({
  intent,
  variant = "secondary",
  children,
}: {
  intent: "draft" | "finalize" | "finalize_print";
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "primary"
      ? "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <button type="submit" name="intent" value={intent} disabled={pending} className={className}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export type InvoiceFormDefaultValues = {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  referenceNumber: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  roundOff: boolean;
  notes: string;
  terms: string;
  noteTemplateId: string;
  termTemplateId: string;
  signatureId: string;
  bankAccountId: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  discountTarget: (typeof DISCOUNT_TARGETS)[number];
  customFieldValues: Record<string, unknown>;
  lineItems: LineItemRow[];
};

export function InvoiceForm({
  mode,
  invoiceId,
  editableStatus,
  customers,
  signatures,
  bankAccounts,
  noteTemplates,
  termTemplates,
  customFieldDefs,
  businessState,
  defaultValues,
}: {
  mode: "create" | "edit";
  invoiceId?: string;
  editableStatus?: "draft" | "pending" | "partially_paid";
  customers: Array<{ id: string; label: string }>;
  signatures: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
  noteTemplates: Array<{ id: string; label: string }>;
  termTemplates: Array<{ id: string; label: string }>;
  customFieldDefs: Array<{
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[];
    required: boolean;
  }>;
  businessState: string;
  defaultValues?: InvoiceFormDefaultValues;
}) {
  const [state, formAction] = useActionState(saveInvoiceAction, initialState);

  const canDraft = mode === "create" || editableStatus === "draft";
  const showPayments = mode === "create" || editableStatus === "draft";
  const placeOfSupplyState = defaultValues?.placeOfSupplyState ?? businessState;

  return (
    <form action={formAction} className="max-w-4xl space-y-8">
      <FormError message={state.error} />
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Customer</span>
          <select
            name="customerId"
            defaultValue={defaultValues?.customerId ?? ""}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.customerId ? (
            <span role="alert" className="mt-1 block text-xs text-red-600">
              {state.fieldErrors.customerId}
            </span>
          ) : null}
        </label>

        <FormField
          label="Place of supply (state)"
          name="placeOfSupplyState"
          required
          defaultValue={placeOfSupplyState}
          error={state.fieldErrors?.placeOfSupplyState}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormField
          label="Invoice date"
          name="invoiceDate"
          type="date"
          required
          defaultValue={defaultValues?.invoiceDate ?? new Date().toISOString().slice(0, 10)}
          error={state.fieldErrors?.invoiceDate}
        />
        <FormField
          label="Due date"
          name="dueDate"
          type="date"
          defaultValue={defaultValues?.dueDate}
          error={state.fieldErrors?.dueDate}
        />
        <FormField
          label="Reference number"
          name="referenceNumber"
          defaultValue={defaultValues?.referenceNumber}
          error={state.fieldErrors?.referenceNumber}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="reverseCharge" defaultChecked={defaultValues?.reverseCharge} />
        Reverse charge applicable
      </label>

      {customFieldDefs.length > 0 ? (
        <fieldset className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-900">Custom fields</legend>
          {customFieldDefs.map((def) => {
            const value = defaultValues?.customFieldValues?.[def.key];
            if (def.type === "select") {
              return (
                <label key={def.key} className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    {def.label}
                    {def.required ? " *" : ""}
                  </span>
                  <select
                    name={def.key}
                    defaultValue={typeof value === "string" ? value : ""}
                    required={def.required}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    {def.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <FormField
                key={def.key}
                label={def.required ? `${def.label} *` : def.label}
                name={def.key}
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                required={def.required}
                defaultValue={
                  typeof value === "string" || typeof value === "number" ? String(value) : ""
                }
                error={state.fieldErrors?.[def.key]}
              />
            );
          })}
        </fieldset>
      ) : null}

      <LineItemsEditor
        defaultRows={defaultValues?.lineItems ?? [{ ...BLANK_LINE_ITEM }]}
        businessState={businessState}
        placeOfSupplyState={placeOfSupplyState}
      />

      <fieldset className="grid grid-cols-4 gap-4 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">Discount &amp; round-off</legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Type</span>
          <select
            name="discountType"
            defaultValue={defaultValues?.discountType ?? "percentage"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="amount">Amount</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Value</span>
          <input
            type="number"
            name="discountValue"
            min="0"
            step="0.01"
            defaultValue={defaultValues?.discountValue ?? "0"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Applies to</span>
          <select
            name="discountTarget"
            defaultValue={defaultValues?.discountTarget ?? "total"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {DISCOUNT_TARGETS.map((t) => (
              <option key={t} value={t}>
                {DISCOUNT_TARGET_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
          <input type="checkbox" name="roundOff" defaultChecked={defaultValues?.roundOff ?? true} />
          Round off total
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notes template</span>
          <select
            name="noteTemplateId"
            defaultValue={defaultValues?.noteTemplateId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {noteTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Terms template</span>
          <select
            name="termTemplateId"
            defaultValue={defaultValues?.termTemplateId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {termTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={defaultValues?.notes}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Terms</span>
          <textarea
            name="terms"
            rows={3}
            defaultValue={defaultValues?.terms}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Signature</span>
          <select
            name="signatureId"
            defaultValue={defaultValues?.signatureId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">No signature</option>
            {signatures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Bank account (shown on invoice)</span>
          <select
            name="bankAccountId"
            defaultValue={defaultValues?.bankAccountId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showPayments ? (
        <PaymentSplitsEditor
          bankAccounts={bankAccounts}
          defaultBankAccountId={defaultValues?.bankAccountId}
        />
      ) : null}

      <div className="flex items-center gap-3">
        {canDraft ? <SubmitIntentButton intent="draft">Save as Draft</SubmitIntentButton> : null}
        <SubmitIntentButton intent="finalize" variant="primary">
          {canDraft ? "Save" : "Save changes"}
        </SubmitIntentButton>
        <SubmitIntentButton intent="finalize_print">Save &amp; Print</SubmitIntentButton>
      </div>
    </form>
  );
}
