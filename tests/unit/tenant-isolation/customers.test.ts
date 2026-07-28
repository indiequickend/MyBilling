import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listCustomers,
  findCustomerById,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  restoreCustomer,
} from "@/lib/db/queries/customers";
import { createPartyGroup } from "@/lib/db/queries/partyGroups";
import { Customer } from "@/lib/db/models/Customer";
import { PartyGroup } from "@/lib/db/models/PartyGroup";

describe("customers — tenant isolation", () => {
  let tenants: TwoTenants;
  let groupAId: string;
  let groupBId: string;
  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("customers");
    const groupA = await createPartyGroup({
      businessId: tenants.businessAId,
      type: "customer",
      name: "VIP",
    });
    const groupB = await createPartyGroup({
      businessId: tenants.businessBId,
      type: "customer",
      name: "VIP",
    });
    groupAId = String(groupA._id);
    groupBId = String(groupB._id);

    const resultA = await createCustomer({
      businessId: tenants.businessAId,
      displayName: "Acme Corp",
      groupIds: [groupAId],
    });
    const resultB = await createCustomer({
      businessId: tenants.businessBId,
      displayName: "Acme Corp",
      groupIds: [groupBId],
    });
    if (!resultA.ok || !resultB.ok) throw new Error("setup failed");
    customerAId = String(resultA.customer._id);
    customerBId = String(resultB.customer._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      PartyGroup.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listCustomers never returns another business's customers", async () => {
    const { items } = await listCustomers(tenants.businessAId);
    expect(items.map((c) => String(c._id))).toContain(customerAId);
    expect(items.map((c) => String(c._id))).not.toContain(customerBId);
  });

  it("findCustomerById refuses a customer belonging to a different business", async () => {
    expect(await findCustomerById(customerBId, tenants.businessAId)).toBeNull();
    expect(await findCustomerById(customerAId, tenants.businessAId)).not.toBeNull();
  });

  it("filtering by another business's groupId returns nothing", async () => {
    const { items } = await listCustomers(tenants.businessAId, { groupId: groupBId });
    expect(items).toHaveLength(0);
  });

  it("createCustomer rejects a groupId that belongs to a different business", async () => {
    const result = await createCustomer({
      businessId: tenants.businessAId,
      displayName: "Should Fail",
      groupIds: [groupBId],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_group_ids");
  });

  it("updateCustomer rejects a groupId that belongs to a different business", async () => {
    const result = await updateCustomer(customerAId, tenants.businessAId, { groupIds: [groupBId] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_group_ids");
  });

  it("soft-delete moves a customer out of the active list without hard-deleting it", async () => {
    await softDeleteCustomer(customerAId, tenants.businessAId);

    const active = await listCustomers(tenants.businessAId, { tab: "active" });
    expect(active.items.map((c) => String(c._id))).not.toContain(customerAId);

    const deleted = await listCustomers(tenants.businessAId, { tab: "deleted" });
    expect(deleted.items.map((c) => String(c._id))).toContain(customerAId);

    const stillExists = await Customer.findById(customerAId);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.deletedAt).toBeInstanceOf(Date);

    await restoreCustomer(customerAId, tenants.businessAId);
  });
});
