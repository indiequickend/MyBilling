import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Only "invoice" is wired up this phase; extend as later phases add attachable document types.
export const ATTACHMENT_LINKED_DOCUMENT_TYPES = ["invoice"] as const;
export type AttachmentLinkedDocumentType = (typeof ATTACHMENT_LINKED_DOCUMENT_TYPES)[number];

const attachmentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    linkedDocumentType: { type: String, enum: ATTACHMENT_LINKED_DOCUMENT_TYPES, required: true },
    linkedDocumentId: { type: Schema.Types.ObjectId, required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    bytes: { type: Number, required: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

attachmentSchema.index({ businessId: 1, linkedDocumentType: 1, linkedDocumentId: 1 });

export type AttachmentDoc = InferSchemaType<typeof attachmentSchema>;

export const Attachment =
  (mongoose.models.Attachment as Model<AttachmentDoc>) ??
  mongoose.model<AttachmentDoc>("Attachment", attachmentSchema);
