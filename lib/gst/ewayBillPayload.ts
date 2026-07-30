import { gstinToStateCode, stateNameToCode, isValidStateCode } from "@/lib/gst/stateCodes";

/** GST e-way bill line items are always product/service description rows — same shape as a
 * document's own line items, but only the fields the NIC schema's itemList needs. */
export type EwayBillLineItemInput = {
  description: string;
  hsnOrSac?: string;
  unit?: string;
  quantity: number;
  taxableAmountMinor: number;
  taxRatePercent: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

export type EwayBillAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export type EwayBillInvoiceInput = {
  docNumber: string;
  invoiceDate: Date;
  placeOfSupplyState: string;
  customerGstin?: string;
  customerDisplayName: string;
  customerAddress?: EwayBillAddressInput;
  lineItems: EwayBillLineItemInput[];
  subtotalMinor: number;
  totalCgstMinor: number;
  totalSgstMinor: number;
  totalIgstMinor: number;
  grandTotalMinor: number;
};

export type EwayBillBusinessInput = {
  gstin?: string;
  displayName: string;
  address?: EwayBillAddressInput;
};

export type EwayBillTransportInput = {
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: Date;
  transMode: "1" | "2" | "3" | "4";
  transDistanceKm?: number;
  vehicleNumber?: string;
  vehicleType: "R" | "O";
  subSupplyType: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
};

export type EwbItemListEntry = {
  productName: string;
  productDesc: string;
  hsnCode: string;
  quantity: number;
  qtyUnit: string;
  taxableAmount: number;
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  cessRate: number;
};

/** Structurally mirrors NIC's documented "Generate EWB" (EWB_INV01) request schema field names —
 * see lib/gst/ewayBillPayload.test.ts for the field-presence check that stands in for the Phase 9
 * verify step ("exported JSON validates against the publicly documented schema, structurally"). */
export type EwbInv01Payload = {
  supplyType: "O";
  subSupplyType: string;
  docType: "INV";
  docNo: string;
  docDate: string;
  transType: "1";
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  fromPincode: string;
  fromStateCode: string;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: string;
  toStateCode: string;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  totInvValue: number;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
  transMode: "1" | "2" | "3" | "4";
  transDistance?: number;
  vehicleNo?: string;
  vehicleType: "R" | "O";
  itemList: EwbItemListEntry[];
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

/**
 * Builds the government's documented e-way bill JSON data object for one Invoice — no NIC API
 * call is ever made; this is only exported for manual upload (project_spec.md → Out of Scope).
 */
export function buildEwayBillPayload(
  invoice: EwayBillInvoiceInput,
  business: EwayBillBusinessInput,
  transport: EwayBillTransportInput,
): EwbInv01Payload {
  return {
    supplyType: "O",
    subSupplyType: transport.subSupplyType,
    docType: "INV",
    docNo: invoice.docNumber,
    docDate: toDdMmYyyy(invoice.invoiceDate),
    transType: "1",
    fromGstin: business.gstin ?? "",
    fromTrdName: business.displayName,
    fromAddr1: business.address?.line1 ?? "",
    fromAddr2: business.address?.line2 ?? "",
    fromPlace: business.address?.city ?? "",
    fromPincode: business.address?.postalCode ?? "",
    fromStateCode: resolveStateCode(business.gstin, business.address?.state),
    toGstin: invoice.customerGstin ?? "URP",
    toTrdName: invoice.customerDisplayName,
    toAddr1: invoice.customerAddress?.line1 ?? "",
    toAddr2: invoice.customerAddress?.line2 ?? "",
    toPlace: invoice.customerAddress?.city ?? "",
    toPincode: invoice.customerAddress?.postalCode ?? "",
    toStateCode: resolveStateCode(invoice.customerGstin, invoice.customerAddress?.state ?? invoice.placeOfSupplyState),
    totalValue: minorToRupees(invoice.subtotalMinor),
    cgstValue: minorToRupees(invoice.totalCgstMinor),
    sgstValue: minorToRupees(invoice.totalSgstMinor),
    igstValue: minorToRupees(invoice.totalIgstMinor),
    cessValue: 0,
    totInvValue: minorToRupees(invoice.grandTotalMinor),
    transporterId: transport.transporterId,
    transporterName: transport.transporterName,
    transDocNo: transport.transDocNo,
    transDocDate: transport.transDocDate ? toDdMmYyyy(transport.transDocDate) : undefined,
    transMode: transport.transMode,
    transDistance: transport.transDistanceKm,
    vehicleNo: transport.vehicleNumber?.toUpperCase(),
    vehicleType: transport.vehicleType,
    itemList: invoice.lineItems.map((li) => {
      const isInterstate = li.igstMinor > 0;
      return {
        productName: li.description,
        productDesc: li.description,
        hsnCode: li.hsnOrSac ?? "",
        quantity: li.quantity,
        qtyUnit: li.unit ?? "PCS",
        taxableAmount: minorToRupees(li.taxableAmountMinor),
        sgstRate: isInterstate ? 0 : li.taxRatePercent / 2,
        cgstRate: isInterstate ? 0 : li.taxRatePercent / 2,
        igstRate: isInterstate ? li.taxRatePercent : 0,
        cessRate: 0,
      };
    }),
  };
}

export type EwayBillValidationResult = { valid: boolean; errors: string[] };

const HSN_LENGTHS = [4, 6, 8];
const PINCODE_REGEX = /^[0-9]{6}$/;

/** Structural validation only — checks the payload's shape against NIC's documented field
 * constraints (required fields present, correct format/type), never a live schema call. */
export function validateEwayBillPayload(payload: EwbInv01Payload): EwayBillValidationResult {
  const errors: string[] = [];

  if (!payload.docNo || payload.docNo.length > 16) {
    errors.push("docNo must be a non-empty string up to 16 characters");
  }
  if (!PINCODE_REGEX.test(payload.fromPincode)) {
    errors.push("fromPincode must be a 6-digit numeric pincode");
  }
  if (!PINCODE_REGEX.test(payload.toPincode)) {
    errors.push("toPincode must be a 6-digit numeric pincode");
  }
  if (!isValidStateCode(payload.fromStateCode)) {
    errors.push("fromStateCode must be a valid 2-digit GST state code");
  }
  if (!isValidStateCode(payload.toStateCode)) {
    errors.push("toStateCode must be a valid 2-digit GST state code");
  }
  if (payload.itemList.length === 0) {
    errors.push("itemList must contain at least one item");
  }
  for (const [i, item] of payload.itemList.entries()) {
    if (!/^[0-9]+$/.test(item.hsnCode) || !HSN_LENGTHS.includes(item.hsnCode.length)) {
      errors.push(`itemList[${i}].hsnCode must be a 4, 6, or 8-digit numeric HSN/SAC code`);
    }
  }
  const expectedTotal =
    payload.totalValue + payload.cgstValue + payload.sgstValue + payload.igstValue + payload.cessValue;
  if (Math.abs(expectedTotal - payload.totInvValue) > 0.02) {
    errors.push("totInvValue must equal totalValue + cgstValue + sgstValue + igstValue + cessValue");
  }
  if (payload.transporterId && payload.transporterId.length !== 15) {
    errors.push("transporterId must be a 15-character transporter GSTIN/ID when provided");
  }

  return { valid: errors.length === 0, errors };
}
