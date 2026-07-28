import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listAttachmentsForDocument,
  createAttachment,
  findAttachmentById,
  deleteAttachment,
} from "@/lib/db/queries/attachments";
import { Attachment } from "@/lib/db/models/Attachment";

describe("attachments — tenant isolation", () => {
  let tenants: TwoTenants;
  let attachmentAId: string;
  const sharedInvoiceId = "507f1f77bcf86cd799439011"; // same document id reused across tenants on purpose

  beforeAll(async () => {
    tenants = await setupTwoTenants("attachments");
    const a = await createAttachment({
      businessId: tenants.businessAId,
      linkedDocumentType: "invoice",
      linkedDocumentId: sharedInvoiceId,
      fileName: "receipt.pdf",
      publicId: "fake-public-id-a",
      url: "https://example.com/a.pdf",
      mimeType: "application/pdf",
      bytes: 1_234,
      uploadedByUserId: tenants.userAId,
    });
    await createAttachment({
      businessId: tenants.businessBId,
      linkedDocumentType: "invoice",
      linkedDocumentId: sharedInvoiceId,
      fileName: "receipt.pdf",
      publicId: "fake-public-id-b",
      url: "https://example.com/b.pdf",
      mimeType: "application/pdf",
      bytes: 1_234,
      uploadedByUserId: tenants.userBId,
    });
    attachmentAId = String(a._id);
  });

  afterAll(async () => {
    await Attachment.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("listAttachmentsForDocument never returns another business's attachment, even for the same document id", async () => {
    const itemsA = await listAttachmentsForDocument("invoice", sharedInvoiceId, tenants.businessAId);
    expect(itemsA).toHaveLength(1);
    expect(itemsA[0].publicId).toBe("fake-public-id-a");
  });

  it("findAttachmentById refuses an attachment belonging to a different business", async () => {
    const itemsB = await listAttachmentsForDocument("invoice", sharedInvoiceId, tenants.businessBId);
    const attachmentBId = String(itemsB[0]._id);
    expect(await findAttachmentById(attachmentBId, tenants.businessAId)).toBeNull();
    expect(await findAttachmentById(attachmentAId, tenants.businessAId)).not.toBeNull();
  });

  it("deleteAttachment cannot delete another business's attachment", async () => {
    const itemsB = await listAttachmentsForDocument("invoice", sharedInvoiceId, tenants.businessBId);
    const attachmentBId = String(itemsB[0]._id);

    const deleted = await deleteAttachment(attachmentBId, tenants.businessAId);
    expect(deleted).toBe(false);

    const stillThere = await findAttachmentById(attachmentBId, tenants.businessBId);
    expect(stillThere).not.toBeNull();
  });

  it("deleteAttachment hard-deletes the caller's own attachment", async () => {
    const deleted = await deleteAttachment(attachmentAId, tenants.businessAId);
    expect(deleted).toBe(true);
    expect(await findAttachmentById(attachmentAId, tenants.businessAId)).toBeNull();
  });
});
