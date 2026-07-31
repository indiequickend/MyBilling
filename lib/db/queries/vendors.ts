import { connectToDatabase } from "@/lib/db/connect";
import { Vendor, type VendorDoc } from "@/lib/db/models/Vendor";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { findOwnedPartyGroupIds } from "@/lib/db/queries/partyGroups";
import type { AddressInput } from "@/lib/validation/shared";

export type VendorListParams = {
  search?: string;
  groupId?: string;
  tab?: "active" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listVendors(businessId: string, params: VendorListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [
      { displayName: pattern },
      { companyName: pattern },
      { gstin: pattern },
      { phone: pattern },
      { email: pattern },
    ];
  }
  if (params.groupId) {
    filter.groupIds = params.groupId;
  }
  return paginate(Vendor, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { displayName: 1 },
  });
}

export async function findVendorById(vendorId: string, businessId: string) {
  await connectToDatabase();
  return Vendor.findOne({ _id: vendorId, businessId });
}

/** Unpaginated variant of listVendors for bulk export — "everything matching this search/tab
 * filter," not one page of it. */
export async function listAllVendors(
  businessId: string,
  params: { search?: string; tab?: "active" | "deleted" } = {},
) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [
      { displayName: pattern },
      { companyName: pattern },
      { gstin: pattern },
      { phone: pattern },
      { email: pattern },
    ];
  }
  return Vendor.find(filter).sort({ displayName: 1 }).lean();
}

export type VendorInput = {
  businessId: string;
  displayName: string;
  companyName?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  groupIds?: string[];
  billingAddress?: AddressInput;
  shippingAddress?: AddressInput;
  notes?: string;
};

export type VendorWriteResult =
  | { ok: true; vendor: InstanceType<typeof Vendor> }
  | { ok: false; reason: "invalid_group_ids" }
  | { ok: false; reason: "not_found" };

/**
 * Verifies every submitted groupId actually belongs to this business and is a
 * vendor-type group — not just that reads are businessId-scoped, but that a
 * write can't attach a foreign business's group id to one of our documents.
 */
async function assertOwnedGroupIds(
  groupIds: string[],
  businessId: string,
): Promise<string[] | null> {
  const uniqueIds = [...new Set(groupIds)];
  if (uniqueIds.length === 0) return [];
  const owned = await findOwnedPartyGroupIds(uniqueIds, businessId, "vendor");
  return owned.length === uniqueIds.length ? owned : null;
}

export async function createVendor(input: VendorInput): Promise<VendorWriteResult> {
  await connectToDatabase();
  const groupIds = await assertOwnedGroupIds(input.groupIds ?? [], input.businessId);
  if (groupIds === null) return { ok: false, reason: "invalid_group_ids" };

  const vendor = await Vendor.create({ ...input, groupIds });
  return { ok: true, vendor };
}

export async function updateVendor(
  vendorId: string,
  businessId: string,
  updates: Partial<Omit<VendorInput, "businessId">>,
): Promise<VendorWriteResult> {
  await connectToDatabase();

  let groupIds: string[] | undefined;
  if (updates.groupIds) {
    const owned = await assertOwnedGroupIds(updates.groupIds, businessId);
    if (owned === null) return { ok: false, reason: "invalid_group_ids" };
    groupIds = owned;
  }

  const vendor = await Vendor.findOneAndUpdate(
    { _id: vendorId, businessId },
    { $set: { ...updates, ...(groupIds ? { groupIds } : {}) } },
    { returnDocument: "after" },
  );
  if (!vendor) return { ok: false, reason: "not_found" };
  return { ok: true, vendor };
}

export async function softDeleteVendor(vendorId: string, businessId: string) {
  await connectToDatabase();
  return Vendor.findOneAndUpdate(
    { _id: vendorId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreVendor(vendorId: string, businessId: string) {
  await connectToDatabase();
  return Vendor.findOneAndUpdate(
    { _id: vendorId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type { VendorDoc };
