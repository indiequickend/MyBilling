import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/constants/businessTypes";

export type { BusinessType };

const customFieldDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["text", "number", "date", "select"], required: true },
    options: { type: [String], default: undefined },
    required: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const documentPreferencesSchema = new Schema(
  {
    roundOff: { type: Boolean, default: true },
    defaultDiscountType: { type: String, enum: ["amount", "percentage"], default: "percentage" },
    showHeaderFieldSuggestions: { type: Boolean, default: true },
    defaultDueDateDays: { type: Number, default: 15 },
    // Purchases-only: gates both the visibility of the per-line-item ITC-eligible checkbox and
    // its default value (shown+defaulted true when on, hidden+forced false when off). Unused by
    // sales/conversions.
    trackItcEligibility: { type: Boolean, default: false },
  },
  { _id: false },
);

const productPreferencesSchema = new Schema(
  {
    defaultItemType: { type: String, enum: ["product", "service"], default: "product" },
    defaultPriceInclusiveOfTax: { type: Boolean, default: false },
    maxDiscountPercent: { type: Number, default: 100 },
    defaultUnit: { type: String, default: "PCS" },
    defaultTaxRatePercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const inventoryPreferencesSchema = new Schema(
  {
    trackInventory: { type: Boolean, default: true },
    defaultWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
  },
  { _id: false },
);

const batchPreferencesSchema = new Schema(
  {
    batchTrackingEnabledByDefault: { type: Boolean, default: false },
    expiryTrackingEnabledByDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    brandName: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    logoPublicId: { type: String },
    logoUrl: { type: String },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    businessType: { type: String, enum: BUSINESS_TYPES },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    alternateContact: { type: String, trim: true },
    website: { type: String, trim: true },

    addresses: {
      billing: { type: addressSchema, default: undefined },
      shipping: { type: addressSchema, default: undefined },
    },

    // Business-defined custom fields (e.g. "MSME Registration"). Definitions have
    // a fixed shape (a real subdocument schema); values are an open bag keyed by
    // each def's `key`, so they stay Mixed.
    customFieldDefs: { type: [customFieldDefSchema], default: [] },
    customFieldValues: { type: Schema.Types.Mixed, default: {} },

    // Per-document-type custom header fields (e.g. a travel agency's "Journey Start Date" on
    // Invoices) — a DIFFERENT concept from customFieldDefs/customFieldValues above, which are
    // Company Details fields. Keyed by DocumentType (see lib/constants/documentTypes.ts); each
    // value is an array of the same customFieldDefSchema shape. Mixed (not a real Map type, to
    // match this file's existing customFieldValues convention) so callers key into it as a plain
    // object: business.documentCustomFieldDefs["invoice"].
    documentCustomFieldDefs: { type: Schema.Types.Mixed, default: {} },

    preferences: {
      document: {
        sales: { type: documentPreferencesSchema, default: () => ({}) },
        purchases: { type: documentPreferencesSchema, default: () => ({}) },
        conversions: { type: documentPreferencesSchema, default: () => ({}) },
      },
      documentNumbering: {
        fyStartMonth: { type: Number, required: true, default: 4 },
        // Keyed by DocumentType, Mixed for the same reason as documentCustomFieldDefs above.
        configs: { type: Schema.Types.Mixed, default: {} },
      },
      productsInventory: {
        product: { type: productPreferencesSchema, default: () => ({}) },
        inventory: { type: inventoryPreferencesSchema, default: () => ({}) },
        batch: { type: batchPreferencesSchema, default: () => ({}) },
      },
    },

    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export type CustomFieldDefDoc = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
  required: boolean;
};

export type DocumentPreferences = {
  roundOff: boolean;
  defaultDiscountType: "amount" | "percentage";
  showHeaderFieldSuggestions: boolean;
  defaultDueDateDays: number;
  trackItcEligibility: boolean;
};

export type ProductPreferences = {
  defaultItemType: "product" | "service";
  defaultPriceInclusiveOfTax: boolean;
  maxDiscountPercent: number;
  defaultUnit: string;
  defaultTaxRatePercent: number;
};

export type InventoryPreferences = {
  trackInventory: boolean;
  defaultWarehouseId?: mongoose.Types.ObjectId;
};

export type BatchPreferences = {
  batchTrackingEnabledByDefault: boolean;
  expiryTrackingEnabledByDefault: boolean;
};

export type DocumentNumberingConfig = {
  prefix: string;
  padding: number;
  resetPolicy: "never" | "fiscal_year";
};

export type DocumentNumberingPreferences = {
  fyStartMonth: number;
  configs: Record<string, DocumentNumberingConfig>;
};

export type BusinessPreferences = {
  document: {
    sales: DocumentPreferences;
    purchases: DocumentPreferences;
    conversions: DocumentPreferences;
  };
  documentNumbering: DocumentNumberingPreferences;
  productsInventory: {
    product: ProductPreferences;
    inventory: InventoryPreferences;
    batch: BatchPreferences;
  };
};

export type BusinessDoc = {
  name: string;
  brandName?: string;
  createdByUserId: mongoose.Types.ObjectId;
  logoPublicId?: string;
  logoUrl?: string;
  gstin?: string;
  pan?: string;
  businessType?: BusinessType;
  phone?: string;
  email?: string;
  alternateContact?: string;
  website?: string;
  addresses?: { billing?: AddressSubdoc; shipping?: AddressSubdoc };
  customFieldDefs: CustomFieldDefDoc[];
  customFieldValues: Record<string, unknown>;
  documentCustomFieldDefs: Record<string, CustomFieldDefDoc[]>;
  preferences: BusinessPreferences;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const Business =
  (mongoose.models.Business as Model<BusinessDoc>) ??
  mongoose.model<BusinessDoc>("Business", businessSchema);
