"use client";

import { useCallback, useState } from "react";
import { ComboboxField } from "@/components/ui/ComboboxField";
import {
  QuickAddPartyDialog,
  type QuickAddPartyState,
} from "@/components/documents/QuickAddPartyDialog";

/** Customer/vendor picker for a document form (Invoice, Quotation, Purchase, ...) — same drop-in
 * API as ComboboxField, plus an inline "+" button that opens a quick-add dialog (QuickAddPartyDialog)
 * so the user can create the customer/vendor without leaving the document. The newly created party
 * is appended to the option list and selected immediately. */
export function PartyComboboxField({
  partyType,
  action,
  name,
  defaultValue = "",
  placeholder,
  searchPlaceholder,
  options,
  required,
  disabled,
  className,
  onValueChange,
}: {
  partyType: "customer" | "vendor";
  /** The quick-create server action (quickCreateCustomerAction / quickCreateVendorAction). */
  action: (prev: QuickAddPartyState, formData: FormData) => Promise<QuickAddPartyState>;
  name?: string;
  defaultValue?: string;
  placeholder: string;
  searchPlaceholder?: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const [createdOptions, setCreatedOptions] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [selected, setSelected] = useState(defaultValue);

  // Only the first page of parties is preloaded into `options`; typing searches the whole business.
  const searchParties = useCallback(
    async (query: string) => {
      const res = await fetch(
        `/api/parties/search?type=${partyType}&q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Party search failed");
      const data = (await res.json()) as { parties: Array<{ value: string; label: string }> };
      return data.parties;
    },
    [partyType],
  );

  const resolvePartyLabel = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/parties/search?type=${partyType}&id=${encodeURIComponent(id)}`);
      if (!res.ok) return undefined;
      const data = (await res.json()) as { parties: Array<{ label: string }> };
      return data.parties[0]?.label;
    },
    [partyType],
  );

  function select(value: string) {
    setSelected(value);
    onValueChange?.(value);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <ComboboxField
          name={name}
          value={selected}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          options={[...options, ...createdOptions]}
          required={required}
          disabled={disabled}
          className={className}
          onValueChange={select}
          onSearch={searchParties}
          onResolveLabel={resolvePartyLabel}
        />
      </div>
      <QuickAddPartyDialog
        partyType={partyType}
        action={action}
        onCreated={(party) => {
          setCreatedOptions((prev) => [...prev, { value: party.id, label: party.label }]);
          select(party.id);
        }}
      />
    </div>
  );
}
