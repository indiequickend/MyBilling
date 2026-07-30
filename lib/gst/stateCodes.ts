/**
 * The public 2-digit GST state/UT code table (first two digits of every GSTIN). Needed because
 * `placeOfSupplyState`/`address.state` are stored as free text everywhere in this app (see
 * lib/tax/gstSplit.ts's own doc comment flagging this as a future refinement) but the e-way bill
 * (NIC EWB_INV01) and e-invoice (IRP) schemas both mandate a numeric state code.
 */
export type GstStateCode = { code: string; name: string };

export const GST_STATE_CODES: GstStateCode[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (Old)" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "99", name: "Centre Jurisdiction" },
];

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

const NAME_TO_CODE = new Map(GST_STATE_CODES.map((s) => [normalize(s.name), s.code]));

/** Best-effort lookup of a free-text state name's 2-digit GST code; undefined if unrecognized
 * (e.g. a typo or non-standard name) — callers must handle that case rather than assume success. */
export function stateNameToCode(stateName: string): string | undefined {
  return NAME_TO_CODE.get(normalize(stateName));
}

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** The first 2 characters of a valid GSTIN are always its registration state's GST code. */
export function gstinToStateCode(gstin: string): string | undefined {
  const trimmed = gstin.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(trimmed)) return undefined;
  return trimmed.slice(0, 2);
}

export function isValidStateCode(code: string): boolean {
  return GST_STATE_CODES.some((s) => s.code === code);
}
