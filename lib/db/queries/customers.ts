import { connectToDatabase } from "@/lib/db/connect";
import { Customer, type CustomerDoc } from "@/lib/db/models/Customer";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { findOwnedPartyGroupIds } from "@/lib/db/queries/partyGroups";
import type { AddressInput } from "@/lib/validation/shared";

export type CustomerListParams = {
  search?: string;
  groupId?: string;
  tab?: "active" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listCustomers(businessId: string, params: CustomerListParams = {}) {
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
  return paginate(Customer, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { displayName: 1 },
  });
}

export async function findCustomerById(customerId: string, businessId: string) {
  await connectToDatabase();
  return Customer.findOne({ _id: customerId, businessId });
}

export type CustomerInput = {
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

export type CustomerWriteResult =
  | { ok: true; customer: InstanceType<typeof Customer> }
  | { ok: false; reason: "invalid_group_ids" }
  | { ok: false; reason: "not_found" };

/**
 * Verifies every submitted groupId actually belongs to this business and is a
 * customer-type group — not just that reads are businessId-scoped, but that a
 * write can't attach a foreign business's group id to one of our documents.
 */
async function assertOwnedGroupIds(
  groupIds: string[],
  businessId: string,
): Promise<string[] | null> {
  const uniqueIds = [...new Set(groupIds)];
  if (uniqueIds.length === 0) return [];
  const owned = await findOwnedPartyGroupIds(uniqueIds, businessId, "customer");
  return owned.length === uniqueIds.length ? owned : null;
}

export async function createCustomer(input: CustomerInput): Promise<CustomerWriteResult> {
  await connectToDatabase();
  const groupIds = await assertOwnedGroupIds(input.groupIds ?? [], input.businessId);
  if (groupIds === null) return { ok: false, reason: "invalid_group_ids" };

  const customer = await Customer.create({ ...input, groupIds });
  return { ok: true, customer };
}

export async function updateCustomer(
  customerId: string,
  businessId: string,
  updates: Partial<Omit<CustomerInput, "businessId">>,
): Promise<CustomerWriteResult> {
  await connectToDatabase();

  let groupIds: string[] | undefined;
  if (updates.groupIds) {
    const owned = await assertOwnedGroupIds(updates.groupIds, businessId);
    if (owned === null) return { ok: false, reason: "invalid_group_ids" };
    groupIds = owned;
  }

  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, businessId },
    { $set: { ...updates, ...(groupIds ? { groupIds } : {}) } },
    { returnDocument: "after" },
  );
  if (!customer) return { ok: false, reason: "not_found" };
  return { ok: true, customer };
}

export async function softDeleteCustomer(customerId: string, businessId: string) {
  await connectToDatabase();
  return Customer.findOneAndUpdate(
    { _id: customerId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreCustomer(customerId: string, businessId: string) {
  await connectToDatabase();
  return Customer.findOneAndUpdate(
    { _id: customerId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type { CustomerDoc };
