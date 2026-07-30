"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export type JournalLineRow = {
  accountType: "bank_account" | "customer" | "vendor" | "other" | "";
  accountRefId: string;
  accountLabel: string; // free-text label, only submitted/used when accountType === "other"
  side: "debit" | "credit";
  amount: string; // rupees string
  note: string;
};

const BLANK_ROW: JournalLineRow = {
  accountType: "",
  accountRefId: "",
  accountLabel: "",
  side: "debit",
  amount: "",
  note: "",
};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function JournalLinesEditor({
  rows,
  onChange,
  bankAccounts,
  customers,
  vendors,
}: {
  rows: JournalLineRow[];
  onChange: (rows: JournalLineRow[]) => void;
  bankAccounts: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [openNote, setOpenNote] = useState<Record<number, boolean>>({});

  function update(index: number, patch: Partial<JournalLineRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleAccountChange(index: number, value: string) {
    if (value === "other") {
      update(index, { accountType: "other", accountRefId: "" });
      return;
    }
    const [accountType, accountRefId] = value.split(":");
    update(index, { accountType: accountType as JournalLineRow["accountType"], accountRefId });
  }

  const totalDebitMinor = rows.reduce(
    (s, r) => s + (r.side === "debit" ? Math.round(Number(r.amount || "0") * 100) : 0),
    0,
  );
  const totalCreditMinor = rows.reduce(
    (s, r) => s + (r.side === "credit" ? Math.round(Number(r.amount || "0") * 100) : 0),
    0,
  );
  const differenceMinor = totalDebitMinor - totalCreditMinor;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Account</TableHead>
              <TableHead className="w-28">Side</TableHead>
              <TableHead className="w-32">Amount (₹)</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  <select
                    name={`line__${i}__accountKey`}
                    value={row.accountType === "other" ? "other" : `${row.accountType}:${row.accountRefId}`}
                    onChange={(e) => handleAccountChange(i, e.target.value)}
                    className={fieldClass}
                  >
                    <option value=":">Select account…</option>
                    {bankAccounts.length > 0 ? (
                      <optgroup label="Bank / cash accounts">
                        {bankAccounts.map((a) => (
                          <option key={a.id} value={`bank_account:${a.id}`}>
                            {a.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {customers.length > 0 ? (
                      <optgroup label="Customers">
                        {customers.map((c) => (
                          <option key={c.id} value={`customer:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {vendors.length > 0 ? (
                      <optgroup label="Vendors">
                        {vendors.map((v) => (
                          <option key={v.id} value={`vendor:${v.id}`}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <option value="other">Other (free text)…</option>
                  </select>
                  {row.accountType === "other" ? (
                    <input
                      name={`line__${i}__accountLabel`}
                      value={row.accountLabel}
                      onChange={(e) => update(i, { accountLabel: e.target.value })}
                      placeholder="Account label"
                      className={`mt-1 ${fieldClass}`}
                    />
                  ) : (
                    <input type="hidden" name={`line__${i}__accountLabel`} value="" />
                  )}
                  <input type="hidden" name={`line__${i}__accountType`} value={row.accountType} />
                  <input type="hidden" name={`line__${i}__accountRefId`} value={row.accountRefId} />
                </TableCell>
                <TableCell>
                  <select
                    name={`line__${i}__side`}
                    value={row.side}
                    onChange={(e) => update(i, { side: e.target.value as "debit" | "credit" })}
                    className={fieldClass}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    name={`line__${i}__amountMinor`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className={fieldClass}
                  />
                </TableCell>
                <TableCell>
                  {openNote[i] || row.note ? (
                    <input
                      name={`line__${i}__note`}
                      value={row.note}
                      onChange={(e) => update(i, { note: e.target.value })}
                      className={fieldClass}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpenNote((p) => ({ ...p, [i]: true }))}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + Add note
                      </button>
                      <input type="hidden" name={`line__${i}__note`} value="" />
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    aria-label="Remove line"
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    <X />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Button type="button" variant="outline" onClick={() => onChange([...rows, { ...BLANK_ROW }])}>
        + Add line
      </Button>

      <div
        className={`rounded-lg border p-3 text-sm ${
          differenceMinor === 0 ? "bg-muted/30" : "border-destructive/30 bg-destructive/5 text-destructive"
        }`}
      >
        Debits: ₹{(totalDebitMinor / 100).toFixed(2)} · Credits: ₹{(totalCreditMinor / 100).toFixed(2)} ·
        Difference: ₹{(differenceMinor / 100).toFixed(2)}
        {differenceMinor !== 0 ? " — must be zero before saving" : ""}
      </div>
    </div>
  );
}
