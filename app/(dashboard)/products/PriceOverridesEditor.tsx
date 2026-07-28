"use client";

import { useState } from "react";

export type PriceOverrideRow = { priceListId: string; priceMinor: string };

const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function PriceOverridesEditor({
  defaultOverrides,
  priceLists,
}: {
  defaultOverrides: PriceOverrideRow[];
  priceLists: Array<{ id: string; name: string }>;
}) {
  const [rows, setRows] = useState<PriceOverrideRow[]>(defaultOverrides);

  if (priceLists.length === 0) return null;

  function update(index: number, patch: Partial<PriceOverrideRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-slate-700">Price list overrides</legend>

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            name={`priceOverride__${i}__priceListId`}
            value={row.priceListId}
            onChange={(e) => update(i, { priceListId: e.target.value })}
            className={inputClass}
          >
            <option value="">Select price list…</option>
            {priceLists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            name={`priceOverride__${i}__priceMinor`}
            value={row.priceMinor}
            onChange={(e) => update(i, { priceMinor: e.target.value })}
            placeholder="Price"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            className="shrink-0 text-xs text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { priceListId: "", priceMinor: "" }])}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        + Add price list override
      </button>
    </fieldset>
  );
}
