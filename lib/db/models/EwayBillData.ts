import mongoose, { Schema, type Model } from "mongoose";

export const EWAY_BILL_STATUSES = ["draft", "generated"] as const;
export type EwayBillStatus = (typeof EWAY_BILL_STATUSES)[number];

export const EWAY_BILL_TRANS_MODES = ["1", "2", "3", "4"] as const;
export type EwayBillTransMode = (typeof EWAY_BILL_TRANS_MODES)[number];

export const EWAY_BILL_VEHICLE_TYPES = ["R", "O"] as const;
export type EwayBillVehicleType = (typeof EWAY_BILL_VEHICLE_TYPES)[number];

export const EWAY_BILL_SUB_SUPPLY_TYPES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type EwayBillSubSupplyType = (typeof EWAY_BILL_SUB_SUPPLY_TYPES)[number];

const transportDetailsSchema = new Schema(
  {
    transporterId: { type: String, trim: true, uppercase: true },
    transporterName: { type: String, trim: true },
    transDocNo: { type: String, trim: true },
    transDocDate: { type: Date },
    transMode: { type: String, enum: EWAY_BILL_TRANS_MODES, required: true, default: "1" },
    transDistanceKm: { type: Number },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    vehicleType: { type: String, enum: EWAY_BILL_VEHICLE_TYPES, required: true, default: "R" },
    subSupplyType: { type: String, enum: EWAY_BILL_SUB_SUPPLY_TYPES, required: true, default: "1" },
  },
  { _id: false },
);

/**
 * One record per Invoice with `eWayBillFlag: true` — holds the transport details entered by the
 * user and the last-built e-way bill JSON payload (lib/gst/ewayBillPayload.ts), cached so it can
 * be re-downloaded without recomputing. No NIC API call is ever made (project_spec.md → Out of
 * Scope) — `status: "generated"` only means "a payload has been built and is ready for the user
 * to download and upload manually."
 */
const ewayBillDataSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    status: { type: String, enum: EWAY_BILL_STATUSES, required: true, default: "draft" },
    transportDetails: { type: transportDetailsSchema, default: () => ({}) },
    generatedPayload: { type: Schema.Types.Mixed },
    generatedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

ewayBillDataSchema.index({ businessId: 1, invoiceId: 1 }, { unique: true });
ewayBillDataSchema.index({ businessId: 1, status: 1 });

export type EwayBillTransportDetailsDoc = {
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: Date;
  transMode: EwayBillTransMode;
  transDistanceKm?: number;
  vehicleNumber?: string;
  vehicleType: EwayBillVehicleType;
  subSupplyType: EwayBillSubSupplyType;
};

export type EwayBillDataDoc = {
  businessId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  status: EwayBillStatus;
  transportDetails: EwayBillTransportDetailsDoc;
  generatedPayload?: unknown;
  generatedAt?: Date;
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const EwayBillData =
  (mongoose.models.EwayBillData as Model<EwayBillDataDoc>) ??
  mongoose.model<EwayBillDataDoc>("EwayBillData", ewayBillDataSchema);
