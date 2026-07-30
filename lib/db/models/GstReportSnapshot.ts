import mongoose, { Schema, type Model } from "mongoose";

export const GST_REPORT_TYPES = ["gstr1", "gstr3b", "gstr2b"] as const;
export type GstReportType = (typeof GST_REPORT_TYPES)[number];

/**
 * One document per {businessId, reportType, period} — reused across all three GST report types
 * via the `reportType` discriminator rather than a separate collection per type or a fourth
 * collection for reconciliation state. `computedData`'s shape varies by reportType:
 *   - gstr1 -> { b2b, b2cl, b2cs, creditDebitNotes, exports, nilRated, hsnSummary, documentsIssued }
 *   - gstr3b -> { outwardTaxableSupplies, zeroRated, nilExempt, inwardReverseCharge,
 *                 interstateToUnregistered, itc }
 *   - gstr2b -> { localItcSummary, importedRows, diffResults } — the imported GSTR-2B file's
 *                parsed rows and reconciliation diff live here, not in a separate collection.
 * Computed on-demand (page load / an explicit "recompute" action) — never via cron, matching
 * CLAUDE.md's no-background-jobs rule. `manualFiledFlag` only means something for "gstr1" (the
 * GSTR-1 Filing tracker's manual "mark as filed" flag); it stays false and unused for the others.
 */
const gstReportSnapshotSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    reportType: { type: String, enum: GST_REPORT_TYPES, required: true },
    period: { type: String, required: true, trim: true }, // "YYYY-MM"
    computedData: { type: Schema.Types.Mixed, required: true },
    manualFiledFlag: { type: Boolean, required: true, default: false },
    filedAt: { type: Date },
    filedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    computedAt: { type: Date, required: true },
    importedFileName: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

gstReportSnapshotSchema.index({ businessId: 1, reportType: 1, period: 1 }, { unique: true });
gstReportSnapshotSchema.index({ businessId: 1, period: -1 });

export type GstReportSnapshotDoc = {
  businessId: mongoose.Types.ObjectId;
  reportType: GstReportType;
  period: string;
  computedData: unknown;
  manualFiledFlag: boolean;
  filedAt?: Date;
  filedByUserId?: mongoose.Types.ObjectId;
  computedAt: Date;
  importedFileName?: string;
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const GstReportSnapshot =
  (mongoose.models.GstReportSnapshot as Model<GstReportSnapshotDoc>) ??
  mongoose.model<GstReportSnapshotDoc>("GstReportSnapshot", gstReportSnapshotSchema);
