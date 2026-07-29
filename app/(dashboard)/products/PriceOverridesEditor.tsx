"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PriceOverrideRow = { priceListId: string; priceMinor: string };

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            name={`priceOverride__${i}__priceListId`}
            value={row.priceListId}
            onChange={(e) => update(i, { priceListId: e.target.value })}
            className={fieldClass}
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
            className={fieldClass}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            aria-label="Remove override"
            className="shrink-0 text-destructive hover:text-destructive"
          >
            <X />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => setRows((prev) => [...prev, { priceListId: "", priceMinor: "" }])}
      >
        + Add price list override
      </Button>
    </div>
  );
}
