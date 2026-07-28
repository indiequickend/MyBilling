import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Pure atomic counter — one document per {businessId, docType, seriesKey}. Never written to
 * outside a transaction shared with the document it's numbering (see
 * lib/db/queries/documentSequences.ts::reserveNextDocumentNumber) — that's what makes numbering
 * gap-safe: a rolled-back document creation also rolls back its number reservation.
 */
const documentSequenceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    docType: { type: String, required: true, trim: true },
    seriesKey: { type: String, required: true, trim: true },
    lastNumber: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

documentSequenceSchema.index({ businessId: 1, docType: 1, seriesKey: 1 }, { unique: true });

export type DocumentSequenceDoc = InferSchemaType<typeof documentSequenceSchema>;

export const DocumentSequence =
  (mongoose.models.DocumentSequence as Model<DocumentSequenceDoc>) ??
  mongoose.model<DocumentSequenceDoc>("DocumentSequence", documentSequenceSchema);
