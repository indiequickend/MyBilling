import { connectToDatabase } from "@/lib/db/connect";
import { NoteTermTemplate } from "@/lib/db/models/NoteTermTemplate";
import type { DocumentType } from "@/lib/constants/documentTypes";

export type NoteTermTemplateListParams = {
  docType?: DocumentType;
  kind?: "note" | "term";
  tab?: "active" | "deleted";
};

export async function listNoteTermTemplates(
  businessId: string,
  params: NoteTermTemplateListParams = {},
) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.docType) filter.docType = params.docType;
  if (params.kind) filter.kind = params.kind;
  return NoteTermTemplate.find(filter).sort({ docType: 1, kind: 1, title: 1 }).lean();
}

export async function findNoteTermTemplateById(id: string, businessId: string) {
  await connectToDatabase();
  return NoteTermTemplate.findOne({ _id: id, businessId });
}

export async function isOwnedNoteTermTemplate(id: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await NoteTermTemplate.countDocuments({
    _id: id,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export type NoteTermTemplateInput = {
  businessId: string;
  docType: DocumentType;
  kind: "note" | "term";
  title?: string;
  body: string;
  isActive: boolean;
};

export async function createNoteTermTemplate(input: NoteTermTemplateInput) {
  await connectToDatabase();
  return NoteTermTemplate.create(input);
}

export async function updateNoteTermTemplate(
  id: string,
  businessId: string,
  updates: Partial<Omit<NoteTermTemplateInput, "businessId" | "docType" | "kind">>,
) {
  await connectToDatabase();
  return NoteTermTemplate.findOneAndUpdate(
    { _id: id, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/** Not transactional — acceptable for a low-concurrency settings action. Default is scoped to
 * the template's own {docType, kind}, since e.g. an Invoice "note" default is independent of an
 * Invoice "term" default. */
export async function setDefaultNoteTermTemplate(id: string, businessId: string) {
  await connectToDatabase();
  const template = await NoteTermTemplate.findOne({ _id: id, businessId });
  if (!template) return null;
  await NoteTermTemplate.updateMany(
    { businessId, docType: template.docType, kind: template.kind, isDefault: true },
    { $set: { isDefault: false } },
  );
  return NoteTermTemplate.findOneAndUpdate(
    { _id: id, businessId },
    { $set: { isDefault: true } },
    { returnDocument: "after" },
  );
}

export async function softDeleteNoteTermTemplate(id: string, businessId: string) {
  await connectToDatabase();
  return NoteTermTemplate.findOneAndUpdate(
    { _id: id, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  );
}

export async function restoreNoteTermTemplate(id: string, businessId: string) {
  await connectToDatabase();
  return NoteTermTemplate.findOneAndUpdate(
    { _id: id, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
