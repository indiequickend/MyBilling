import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DOCUMENT_TYPES } from "@/lib/constants/documentTypes";

const noteTermTemplateSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    docType: { type: String, enum: DOCUMENT_TYPES, required: true },
    kind: { type: String, enum: ["note", "term"], required: true },
    title: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

noteTermTemplateSchema.index({ businessId: 1, docType: 1, kind: 1 });

export type NoteTermTemplateDoc = InferSchemaType<typeof noteTermTemplateSchema>;

export const NoteTermTemplate =
  (mongoose.models.NoteTermTemplate as Model<NoteTermTemplateDoc>) ??
  mongoose.model<NoteTermTemplateDoc>("NoteTermTemplate", noteTermTemplateSchema);
