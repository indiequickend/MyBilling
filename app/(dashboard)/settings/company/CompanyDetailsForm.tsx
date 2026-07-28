"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { AddressFields, type AddressFieldValues } from "@/components/ui/AddressFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from "@/lib/constants/businessTypes";
import { updateCompanyDetailsAction, type CompanyPageState } from "./actions";

const initialState: CompanyPageState = {};

export function CompanyDetailsForm({
  details,
}: {
  details: {
    name: string;
    brandName: string;
    gstin: string;
    pan: string;
    businessType: string;
    phone: string;
    email: string;
    alternateContact: string;
    website: string;
    billing: AddressFieldValues | null;
    shipping: AddressFieldValues | null;
    logoUrl: string | null;
  };
}) {
  const [state, formAction] = useActionState(updateCompanyDetailsAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="flex items-center gap-4">
        {details.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={details.logoUrl}
            alt="Company logo"
            className="h-16 w-16 rounded-md border border-slate-200 object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
            No logo
          </div>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Logo</span>
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Legal company name"
          name="name"
          required
          defaultValue={details.name}
          error={state.fieldErrors?.name}
        />
        <FormField
          label="Brand name"
          name="brandName"
          defaultValue={details.brandName}
          error={state.fieldErrors?.brandName}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="GSTIN"
          name="gstin"
          defaultValue={details.gstin}
          placeholder="22AAAAA0000A1Z5"
          error={state.fieldErrors?.gstin}
        />
        <FormField
          label="PAN"
          name="pan"
          defaultValue={details.pan}
          placeholder="AAAAA0000A"
          error={state.fieldErrors?.pan}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Business type</span>
        <select
          name="businessType"
          defaultValue={details.businessType}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {BUSINESS_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Phone"
          name="phone"
          defaultValue={details.phone}
          error={state.fieldErrors?.phone}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={details.email}
          error={state.fieldErrors?.email}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Alternate contact"
          name="alternateContact"
          defaultValue={details.alternateContact}
        />
        <FormField label="Website" name="website" defaultValue={details.website} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <AddressFields
          legend="Billing address"
          namePrefix="billing"
          defaultValue={details.billing}
        />
        <AddressFields
          legend="Shipping address"
          namePrefix="shipping"
          defaultValue={details.shipping}
        />
      </div>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save company details</SubmitButton>
      </div>
    </form>
  );
}
