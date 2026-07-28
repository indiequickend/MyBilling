import { connectToDatabase } from "@/lib/db/connect";
import { Signature } from "@/lib/db/models/Signature";

export async function listSignatures(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return Signature.find(filter).sort({ name: 1 }).lean();
}

export async function findSignatureById(signatureId: string, businessId: string) {
  await connectToDatabase();
  return Signature.findOne({ _id: signatureId, businessId });
}

export async function isOwnedSignature(signatureId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await Signature.countDocuments({
    _id: signatureId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export type SignatureInput = {
  businessId: string;
  name: string;
  imagePublicId: string;
  imageUrl: string;
};

export async function createSignature(input: SignatureInput) {
  await connectToDatabase();
  return Signature.create(input);
}

export async function updateSignature(
  signatureId: string,
  businessId: string,
  updates: Partial<Omit<SignatureInput, "businessId">>,
) {
  await connectToDatabase();
  return Signature.findOneAndUpdate(
    { _id: signatureId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/** Not transactional — acceptable for a low-concurrency settings action. */
export async function setDefaultSignature(signatureId: string, businessId: string) {
  await connectToDatabase();
  await Signature.updateMany({ businessId, isDefault: true }, { $set: { isDefault: false } });
  return Signature.findOneAndUpdate(
    { _id: signatureId, businessId },
    { $set: { isDefault: true } },
    { returnDocument: "after" },
  );
}

export async function softDeleteSignature(signatureId: string, businessId: string) {
  await connectToDatabase();
  return Signature.findOneAndUpdate(
    { _id: signatureId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  );
}

export async function restoreSignature(signatureId: string, businessId: string) {
  await connectToDatabase();
  return Signature.findOneAndUpdate(
    { _id: signatureId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
