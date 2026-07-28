export type TaxSplit = { cgstMinor: number; sgstMinor: number; igstMinor: number; totalTaxMinor: number };

function normalizeState(state: string): string {
  return state.trim().toLowerCase();
}

/**
 * Two blank/unset states are treated as "same state" (CGST+SGST) rather than failing, since a
 * missing state can't be told which regime applies — `placeOfSupplyState` is required at the
 * Zod/form boundary precisely so this never happens on a real save.
 */
export function isSameState(businessState: string, placeOfSupplyState: string): boolean {
  return normalizeState(businessState) === normalizeState(placeOfSupplyState);
}

/**
 * Splits a taxable amount's GST into CGST+SGST (intra-state) or IGST (inter-state) by comparing
 * the business's billing state against the invoice's place of supply. A GSTIN-state-code
 * cross-check table is a reasonable future refinement, not required for Phase 3.
 */
export function splitTax(
  taxableAmountMinor: number,
  taxRatePercent: number,
  businessState: string,
  placeOfSupplyState: string,
): TaxSplit {
  const totalTaxMinor = Math.round((taxableAmountMinor * taxRatePercent) / 100);
  if (!isSameState(businessState, placeOfSupplyState)) {
    return { cgstMinor: 0, sgstMinor: 0, igstMinor: totalTaxMinor, totalTaxMinor };
  }
  const cgstMinor = Math.round(totalTaxMinor / 2);
  const sgstMinor = totalTaxMinor - cgstMinor;
  return { cgstMinor, sgstMinor, igstMinor: 0, totalTaxMinor };
}
