import { gstinToStateCode, stateNameToCode, isValidStateCode } from "@/lib/gst/stateCodes";

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export type EInvoiceAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export type EInvoiceLineItemInput = {
  description: string;
  hsnOrSac?: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  taxableAmountMinor: number;
  taxRatePercent: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

export type EInvoiceInvoiceInput = {
  docNumber: string;
  invoiceDate: Date;
  reverseCharge: boolean;
  placeOfSupplyState: string;
  customerGstin?: string;
  customerDisplayName: string;
  customerAddress?: EInvoiceAddressInput;
  lineItems: EInvoiceLineItemInput[];
  subtotalMinor: number;
  totalCgstMinor: number;
  totalSgstMinor: number;
  totalIgstMinor: number;
  discountAmountMinor: number;
  roundOffAmountMinor: number;
  grandTotalMinor: number;
};

export type EInvoiceBusinessInput = {
  gstin?: string;
  displayName: string;
  phone?: string;
  email?: string;
  address?: EInvoiceAddressInput;
};

export type IrpItemListEntry = {
  SlNo: string;
  PrdDesc: string;
  IsServc: "Y" | "N";
  HsnCd: string;
  Qty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  AssAmt: number;
  GstRt: number;
  CgstAmt: number;
  SgstAmt: number;
  IgstAmt: number;
  TotItemVal: number;
};

/** Structurally mirrors the IRP (Invoice Registration Portal) e-invoice schema v1.1's documented
 * top-level sections — Version/TranDtls/DocDtls/SellerDtls/BuyerDtls/ItemList/ValDtls. Never sent
 * to a real IRP; used only to generate a downloadable JSON for manual upload
 * (project_spec.md → Out of Scope: live IRN generation). */
export type IrpPayload = {
  Version: "1.1";
  TranDtls: { TaxSch: "GST"; SupTyp: "B2B" | "B2C"; RegRev: "Y" | "N" };
  DocDtls: { Typ: "INV"; No: string; Dt: string };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    Addr1: string;
    Addr2: string;
    Loc: string;
    Pin: string;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    Pos: string;
    Addr1: string;
    Addr2: string;
    Loc: string;
    Pin: string;
    Stcd: string;
  };
  ItemList: IrpItemListEntry[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    Discount: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
};

function toDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function minorToRupees(minor: number): number {
  return Math.round(minor) / 100;
}

function resolveStateCode(gstin: string | undefined, stateName: string | undefined): string {
  if (gstin) {
    const fromGstin = gstinToStateCode(gstin);
    if (fromGstin) return fromGstin;
  }
  if (stateName) {
    const fromName = stateNameToCode(stateName);
    if (fromName) return fromName;
  }
  return "";
}

export function buildEInvoicePayload(invoice: EInvoiceInvoiceInput, business: EInvoiceBusinessInput): IrpPayload {
  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: invoice.customerGstin ? "B2B" : "B2C",
      RegRev: invoice.reverseCharge ? "Y" : "N",
    },
    DocDtls: { Typ: "INV", No: invoice.docNumber, Dt: toDdMmYyyy(invoice.invoiceDate) },
    SellerDtls: {
      Gstin: business.gstin ?? "",
      LglNm: business.displayName,
      Addr1: business.address?.line1 ?? "",
      Addr2: business.address?.line2 ?? "",
      Loc: business.address?.city ?? "",
      Pin: business.address?.postalCode ?? "",
      Stcd: resolveStateCode(business.gstin, business.address?.state),
      Ph: business.phone,
      Em: business.email,
    },
    BuyerDtls: {
      Gstin: invoice.customerGstin ?? "URP",
      LglNm: invoice.customerDisplayName,
      Pos: resolveStateCode(invoice.customerGstin, invoice.placeOfSupplyState),
      Addr1: invoice.customerAddress?.line1 ?? "",
      Addr2: invoice.customerAddress?.line2 ?? "",
      Loc: invoice.customerAddress?.city ?? "",
      Pin: invoice.customerAddress?.postalCode ?? "",
      Stcd: resolveStateCode(invoice.customerGstin, invoice.customerAddress?.state ?? invoice.placeOfSupplyState),
    },
    ItemList: invoice.lineItems.map((li, i) => ({
      SlNo: String(i + 1),
      PrdDesc: li.description,
      // Approximation: line items don't carry a goods/service flag of their own (see
      // lib/db/models/shared/lineItem.ts), and HSN (goods) codes can also be 6 digits, so this
      // isn't fully reliable — a future refinement would resolve it from the linked Product's
      // own `type` field instead.
      IsServc: li.hsnOrSac && li.hsnOrSac.length <= 6 ? "Y" : "N",
      HsnCd: li.hsnOrSac ?? "",
      Qty: li.quantity,
      Unit: li.unit ?? "PCS",
      UnitPrice: minorToRupees(li.unitPriceMinor),
      TotAmt: minorToRupees(li.unitPriceMinor * li.quantity),
      Discount: 0,
      AssAmt: minorToRupees(li.taxableAmountMinor),
      GstRt: li.taxRatePercent,
      CgstAmt: minorToRupees(li.cgstMinor),
      SgstAmt: minorToRupees(li.sgstMinor),
      IgstAmt: minorToRupees(li.igstMinor),
      TotItemVal: minorToRupees(li.totalMinor),
    })),
    ValDtls: {
      AssVal: minorToRupees(invoice.subtotalMinor),
      CgstVal: minorToRupees(invoice.totalCgstMinor),
      SgstVal: minorToRupees(invoice.totalSgstMinor),
      IgstVal: minorToRupees(invoice.totalIgstMinor),
      Discount: minorToRupees(invoice.discountAmountMinor),
      RndOffAmt: minorToRupees(invoice.roundOffAmountMinor),
      TotInvVal: minorToRupees(invoice.grandTotalMinor),
    },
  };
}

export type EInvoiceValidationResult = { valid: boolean; errors: string[] };

const PINCODE_REGEX = /^[0-9]{6}$/;
const HSN_LENGTHS = [4, 6, 8];

/** Structural validation only — drives EInvoiceData.validationStatus ("success" means locally
 * valid & ready for manual IRP upload, never a real IRN). */
export function validateEInvoicePayload(payload: IrpPayload): EInvoiceValidationResult {
  const errors: string[] = [];

  if (!GSTIN_SHAPE.test(payload.SellerDtls.Gstin)) {
    errors.push("SellerDtls.Gstin must be a valid 15-character GSTIN");
  }
  if (payload.BuyerDtls.Gstin !== "URP" && !GSTIN_SHAPE.test(payload.BuyerDtls.Gstin)) {
    errors.push("BuyerDtls.Gstin must be a valid GSTIN or \"URP\" for an unregistered buyer");
  }
  if (!payload.DocDtls.No) {
    errors.push("DocDtls.No is required");
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(payload.DocDtls.Dt)) {
    errors.push("DocDtls.Dt must be in dd/mm/yyyy format");
  }
  if (!isValidStateCode(payload.SellerDtls.Stcd)) {
    errors.push("SellerDtls.Stcd must be a valid 2-digit GST state code");
  }
  if (!isValidStateCode(payload.BuyerDtls.Stcd)) {
    errors.push("BuyerDtls.Stcd must be a valid 2-digit GST state code");
  }
  if (!PINCODE_REGEX.test(payload.SellerDtls.Pin)) {
    errors.push("SellerDtls.Pin must be a 6-digit numeric pincode");
  }
  if (!PINCODE_REGEX.test(payload.BuyerDtls.Pin)) {
    errors.push("BuyerDtls.Pin must be a 6-digit numeric pincode");
  }
  if (payload.ItemList.length === 0) {
    errors.push("ItemList must contain at least one item");
  }
  for (const [i, item] of payload.ItemList.entries()) {
    if (!/^[0-9]+$/.test(item.HsnCd) || !HSN_LENGTHS.includes(item.HsnCd.length)) {
      errors.push(`ItemList[${i}].HsnCd must be a 4, 6, or 8-digit numeric HSN/SAC code`);
    }
  }
  const expectedTotal =
    payload.ValDtls.AssVal +
    payload.ValDtls.CgstVal +
    payload.ValDtls.SgstVal +
    payload.ValDtls.IgstVal -
    payload.ValDtls.Discount +
    payload.ValDtls.RndOffAmt;
  if (Math.abs(expectedTotal - payload.ValDtls.TotInvVal) > 0.02) {
    errors.push("ValDtls.TotInvVal must reconcile against AssVal + tax − Discount + RndOffAmt");
  }

  return { valid: errors.length === 0, errors };
}
