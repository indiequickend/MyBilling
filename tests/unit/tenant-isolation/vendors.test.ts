import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listVendors,
  findVendorById,
  createVendor,
  updateVendor,
  softDeleteVendor,
  restoreVendor,
} from "@/lib/db/queries/vendors";
import { createPartyGroup } from "@/lib/db/queries/partyGroups";
import { Vendor } from "@/lib/db/models/Vendor";
import { PartyGroup } from "@/lib/db/models/PartyGroup";

describe("vendors — tenant isolation", () => {
  let tenants: TwoTenants;
  let groupAId: string;
  let groupBId: string;
  let vendorAId: string;
  let vendorBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("vendors");
    const groupA = await createPartyGroup({
      businessId: tenants.businessAId,
      type: "vendor",
      name: "Preferred",
    });
    const groupB = await createPartyGroup({
      businessId: tenants.businessBId,
      type: "vendor",
      name: "Preferred",
    });
    groupAId = String(groupA._id);
    groupBId = String(groupB._id);

    const resultA = await createVendor({
      businessId: tenants.businessAId,
      displayName: "Supplier Co",
      groupIds: [groupAId],
    });
    const resultB = await createVendor({
      businessId: tenants.businessBId,
      displayName: "Supplier Co",
      groupIds: [groupBId],
    });
    if (!resultA.ok || !resultB.ok) throw new Error("setup failed");
    vendorAId = String(resultA.vendor._id);
    vendorBId = String(resultB.vendor._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      PartyGroup.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listVendors never returns another business's vendors", async () => {
    const { items } = await listVendors(tenants.businessAId);
    expect(items.map((v) => String(v._id))).toContain(vendorAId);
    expect(items.map((v) => String(v._id))).not.toContain(vendorBId);
  });

  it("findVendorById refuses a vendor belonging to a different business", async () => {
    expect(await findVendorById(vendorBId, tenants.businessAId)).toBeNull();
    expect(await findVendorById(vendorAId, tenants.businessAId)).not.toBeNull();
  });

  it("filtering by another business's groupId returns nothing", async () => {
    const { items } = await listVendors(tenants.businessAId, { groupId: groupBId });
    expect(items).toHaveLength(0);
  });

  it("createVendor rejects a groupId that belongs to a different business", async () => {
    const result = await createVendor({
      businessId: tenants.businessAId,
      displayName: "Should Fail",
      groupIds: [groupBId],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_group_ids");
  });

  it("updateVendor rejects a groupId that belongs to a different business", async () => {
    const result = await updateVendor(vendorAId, tenants.businessAId, { groupIds: [groupBId] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_group_ids");
  });

  it("soft-delete moves a vendor out of the active list without hard-deleting it", async () => {
    await softDeleteVendor(vendorAId, tenants.businessAId);

    const active = await listVendors(tenants.businessAId, { tab: "active" });
    expect(active.items.map((v) => String(v._id))).not.toContain(vendorAId);

    const deleted = await listVendors(tenants.businessAId, { tab: "deleted" });
    expect(deleted.items.map((v) => String(v._id))).toContain(vendorAId);

    const stillExists = await Vendor.findById(vendorAId);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.deletedAt).toBeInstanceOf(Date);

    await restoreVendor(vendorAId, tenants.businessAId);
  });
});
