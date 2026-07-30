"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BatchRow = { batchNumber: string; expiryDate: string };

const BLANK_ROW: BatchRow = { batchNumber: "", expiryDate: "" };

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function BatchesEditor({ rows, onChange }: { rows: BatchRow[]; onChange: (rows: BatchRow[]) => void }) {
  function update(index: number, patch: Partial<BatchRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Define the batches this product can be received into or sold from. Quantity per batch is
        tracked automatically from Stock In/Out and document activity — not entered here.
      </p>

      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3">
          <input
            name={`batch__${i}__batchNumber`}
            value={row.batchNumber}
            onChange={(e) => update(i, { batchNumber: e.target.value })}
            placeholder="Batch number"
            className={fieldClass}
          />
          <input
            name={`batch__${i}__expiryDate`}
            type="date"
            value={row.expiryDate}
            onChange={(e) => update(i, { expiryDate: e.target.value })}
            className={fieldClass}
          />
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              aria-label="Remove batch"
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <X />
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange([...rows, { ...BLANK_ROW }])}>
        + Add batch
      </Button>
    </div>
  );
}
