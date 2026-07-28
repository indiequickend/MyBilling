import { Schema } from "mongoose";

/** Reused as a subdocument by Business, Customer, Vendor, Warehouse. */
export const addressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { _id: false },
);

export type AddressSubdoc = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

/**
 * Address fields come off a live (non-`.lean()`) parent document as a real
 * Mongoose single-nested subdocument, which carries circular parent/schema
 * references — passing one directly as a Client Component prop overflows
 * React's Flight serializer. Always convert with this before crossing that
 * boundary; `.lean()` reads don't need it (already plain objects).
 */
export function toPlainAddress(subdoc: unknown): AddressSubdoc | null {
  if (!subdoc) return null;
  if (typeof (subdoc as { toObject?: unknown }).toObject === "function") {
    return (subdoc as { toObject: () => AddressSubdoc }).toObject();
  }
  return subdoc as AddressSubdoc;
}
