import { connectToDatabase } from "@/lib/db/connect";
import { Attachment, type AttachmentLinkedDocumentType } from "@/lib/db/models/Attachment";
import { deleteFile } from "@/lib/storage/cloudinary";

export async function listAttachmentsForDocument(
  linkedDocumentType: AttachmentLinkedDocumentType,
  linkedDocumentId: string,
  businessId: string,
) {
  await connectToDatabase();
  return Attachment.find({
    businessId,
    linkedDocumentType,
    linkedDocumentId,
    deletedAt: { $exists: false },
  })
    .sort({ createdAt: -1 })
    .lean();
}

export type CreateAttachmentInput = {
  businessId: string;
  linkedDocumentType: AttachmentLinkedDocumentType;
  linkedDocumentId: string;
  fileName: string;
  publicId: string;
  url: string;
  mimeType: string;
  bytes: number;
  uploadedByUserId: string;
};

export async function createAttachment(input: CreateAttachmentInput) {
  await connectToDatabase();
  return Attachment.create(input);
}

export async function findAttachmentById(attachmentId: string, businessId: string) {
  await connectToDatabase();
  return Attachment.findOne({ _id: attachmentId, businessId });
}

/** Hard delete + Cloudinary cleanup — attachments are file references, not financial history. */
export async function deleteAttachment(attachmentId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const attachment = await Attachment.findOneAndDelete({ _id: attachmentId, businessId });
  if (!attachment) return false;
  await deleteFile(attachment.publicId).catch(() => {});
  return true;
}
