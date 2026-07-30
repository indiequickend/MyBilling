import { isSameState } from "@/lib/tax/gstSplit";
import { classifyInvoiceForGstr1, type Gstr1Invoice, type Gstr1CreditNote } from "@/lib/gst/gstr1";

/**
 * Pure GSTR-3B section builders, same dependency-free/fixture-testable shape as lib/gst/gstr1.ts
 * — reuses its invoice classification rather than re-deriving B2B/B2C/export/nil-rated logic.
 */

export type Gstr3bPurchaseLineItem = {
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  itcEligible: boolean;
};

export type Gstr3bPurchase = {
  purchaseId: string;
  status: string;
  reverseCharge: boolean;
  lineItems: Gstr3bPurchaseLineItem[];
};

export type Gstr3bDebitNoteLineItem = {
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

export type Gstr3bDebitNote = {
  status: string;
  lineItems: Gstr3bDebitNoteLineItem[];
};

function sumLineItems<T extends { taxableAmountMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number }>(
  items: T[],
): { taxableAmountMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number } {
  return items.reduce(
    (acc, li) => ({
      taxableAmountMinor: acc.taxableAmountMinor + li.taxableAmountMinor,
      cgstMinor: acc.cgstMinor + li.cgstMinor,
      sgstMinor: acc.sgstMinor + li.sgstMinor,
      igstMinor: acc.igstMinor + li.igstMinor,
    }),
    { taxableAmountMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0 },
  );
}

export type OutwardTaxableSupplies = {
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

/** GSTR-3B Table 3.1(a) — outward taxable supplies other than zero-rated/nil-rated/exempt, net of
 * issued sales credit notes. */
export function buildOutwardTaxableSupplies(
  invoices: Gstr1Invoice[],
  creditNotes: Gstr1CreditNote[],
  businessState: string,
): OutwardTaxableSupplies {
  const taxable = invoices
    .filter((inv) => inv.status !== "cancelled")
    .filter((inv) => ["b2b", "b2cl", "b2cs"].includes(classifyInvoiceForGstr1(inv, businessState)))
    .flatMap((inv) => inv.lineItems);
  const notes = creditNotes.filter((n) => n.status === "issued").flatMap((n) => n.lineItems);

  const t = sumLineItems(taxable);
  const n = sumLineItems(notes);
  return {
    taxableAmountMinor: t.taxableAmountMinor - n.taxableAmountMinor,
    cgstMinor: t.cgstMinor - n.cgstMinor,
    sgstMinor: t.sgstMinor - n.sgstMinor,
    igstMinor: t.igstMinor - n.igstMinor,
  };
}

export type ZeroRatedAndExempt = { zeroRatedMinor: number; nilExemptMinor: number };

/** GSTR-3B Table 3.1(b) (zero-rated/exports) and 3.1(c) (nil-rated/exempt). */
export function buildZeroRatedAndExempt(invoices: Gstr1Invoice[], businessState: string): ZeroRatedAndExempt {
  let zeroRatedMinor = 0;
  let nilExemptMinor = 0;
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const cls = classifyInvoiceForGstr1(inv, businessState);
    const taxable = inv.lineItems.reduce((sum, li) => sum + li.taxableAmountMinor, 0);
    if (cls === "exports") zeroRatedMinor += taxable;
    if (cls === "nil_rated") nilExemptMinor += taxable;
  }
  return { zeroRatedMinor, nilExemptMinor };
}

/** GSTR-3B Table 3.1(d) — inward supplies liable to reverse charge (recipient self-assesses and
 * pays this tax, so it appears in the outward-liability table even though it's a purchase). */
export function buildInwardReverseCharge(purchases: Gstr3bPurchase[]): OutwardTaxableSupplies {
  const lineItems = purchases
    .filter((p) => p.status !== "cancelled" && p.status !== "draft" && p.reverseCharge)
    .flatMap((p) => p.lineItems);
  return sumLineItems(lineItems);
}

export type InterstateToUnregisteredRow = { placeOfSupplyState: string; taxableAmountMinor: number; igstMinor: number };

/** GSTR-3B Table 3.2 — interstate supplies to unregistered persons (B2C Large/Small invoices that
 * are inter-state), grouped by place of supply. */
export function buildInterstateToUnregistered(
  invoices: Gstr1Invoice[],
  businessState: string,
): InterstateToUnregisteredRow[] {
  const map = new Map<string, InterstateToUnregisteredRow>();
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const cls = classifyInvoiceForGstr1(inv, businessState);
    if (cls !== "b2cl" && cls !== "b2cs") continue;
    if (isSameState(businessState, inv.placeOfSupplyState)) continue;
    const totals = sumLineItems(inv.lineItems);
    const existing = map.get(inv.placeOfSupplyState) ?? {
      placeOfSupplyState: inv.placeOfSupplyState,
      taxableAmountMinor: 0,
      igstMinor: 0,
    };
    existing.taxableAmountMinor += totals.taxableAmountMinor;
    existing.igstMinor += totals.igstMinor;
    map.set(inv.placeOfSupplyState, existing);
  }
  return [...map.values()].sort((a, b) => a.placeOfSupplyState.localeCompare(b.placeOfSupplyState));
}

export type ItcSummary = {
  availableCgstMinor: number;
  availableSgstMinor: number;
  availableIgstMinor: number;
  reversedCgstMinor: number;
  reversedSgstMinor: number;
  reversedIgstMinor: number;
  netCgstMinor: number;
  netSgstMinor: number;
  netIgstMinor: number;
};

/**
 * GSTR-3B Table 4 — ITC available (Purchase line items marked itcEligible) net of Debit Note
 * reversals. Every Debit Note line item's tax is treated as a full reversal (a simplification:
 * this app's itcEligible field is only meaningful on Purchase, not DebitNote — see
 * lib/db/models/shared/lineItem.ts's own doc comment).
 */
export function buildItcSummary(purchases: Gstr3bPurchase[], debitNotes: Gstr3bDebitNote[]): ItcSummary {
  const eligible = purchases
    .filter((p) => p.status !== "cancelled" && p.status !== "draft")
    .flatMap((p) => p.lineItems.filter((li) => li.itcEligible));
  const reversed = debitNotes.filter((n) => n.status === "issued").flatMap((n) => n.lineItems);

  const a = sumLineItems(eligible);
  const r = sumLineItems(reversed);

  return {
    availableCgstMinor: a.cgstMinor,
    availableSgstMinor: a.sgstMinor,
    availableIgstMinor: a.igstMinor,
    reversedCgstMinor: r.cgstMinor,
    reversedSgstMinor: r.sgstMinor,
    reversedIgstMinor: r.igstMinor,
    netCgstMinor: a.cgstMinor - r.cgstMinor,
    netSgstMinor: a.sgstMinor - r.sgstMinor,
    netIgstMinor: a.igstMinor - r.igstMinor,
  };
}
