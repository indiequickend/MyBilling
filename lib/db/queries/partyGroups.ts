import { connectToDatabase } from "@/lib/db/connect";
import { PartyGroup } from "@/lib/db/models/PartyGroup";

export type PartyType = "customer" | "vendor";

export async function listPartyGroups(
  businessId: string,
  type: PartyType,
  tab: "active" | "deleted" = "active",
) {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, type, deletedAt: { $exists: false } }
      : { businessId, type, deletedAt: { $exists: true } };
  return PartyGroup.find(filter).sort({ name: 1 }).lean();
}

export async function findPartyGroupById(groupId: string, businessId: string) {
  await connectToDatabase();
  return PartyGroup.findOne({ _id: groupId, businessId });
}

/**
 * Returns the subset of the given ids that actually belong to `businessId` and
 * have the given party `type` — used to verify ownership of every foreign key
 * a Customer/Vendor submits before writing, not just filter reads.
 */
export async function findOwnedPartyGroupIds(
  groupIds: string[],
  businessId: string,
  type: PartyType,
): Promise<string[]> {
  await connectToDatabase();
  if (groupIds.length === 0) return [];
  const groups = await PartyGroup.find({
    _id: { $in: groupIds },
    businessId,
    type,
    deletedAt: { $exists: false },
  })
    .select("_id")
    .lean();
  return groups.map((g) => String(g._id));
}

export async function createPartyGroup(input: {
  businessId: string;
  type: PartyType;
  name: string;
}) {
  await connectToDatabase();
  return PartyGroup.create(input);
}

export async function updatePartyGroup(
  groupId: string,
  businessId: string,
  updates: { name: string },
) {
  await connectToDatabase();
  return PartyGroup.findOneAndUpdate(
    { _id: groupId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function softDeletePartyGroup(groupId: string, businessId: string) {
  await connectToDatabase();
  return PartyGroup.findOneAndUpdate(
    { _id: groupId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restorePartyGroup(groupId: string, businessId: string) {
  await connectToDatabase();
  return PartyGroup.findOneAndUpdate(
    { _id: groupId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
