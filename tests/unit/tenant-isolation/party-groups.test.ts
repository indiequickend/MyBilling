import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listPartyGroups,
  findPartyGroupById,
  findOwnedPartyGroupIds,
  createPartyGroup,
  softDeletePartyGroup,
  restorePartyGroup,
} from "@/lib/db/queries/partyGroups";
import { PartyGroup } from "@/lib/db/models/PartyGroup";

describe("party groups — tenant isolation", () => {
  let tenants: TwoTenants;
  let groupAId: string;
  let groupBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("party-groups");
    const groupA = await createPartyGroup({
      businessId: tenants.businessAId,
      type: "customer",
      name: "Wholesale",
    });
    const groupB = await createPartyGroup({
      businessId: tenants.businessBId,
      type: "customer",
      name: "Wholesale",
    });
    groupAId = String(groupA._id);
    groupBId = String(groupB._id);
  });

  afterAll(async () => {
    await PartyGroup.deleteMany({
      businessId: { $in: [tenants.businessAId, tenants.businessBId] },
    });
    await teardownTwoTenants(tenants);
  });

  it("listPartyGroups never returns another business's groups", async () => {
    const groupsA = await listPartyGroups(tenants.businessAId, "customer");
    expect(groupsA.map((g) => String(g._id))).toContain(groupAId);
    expect(groupsA.map((g) => String(g._id))).not.toContain(groupBId);
  });

  it("findPartyGroupById refuses a group belonging to a different business", async () => {
    expect(await findPartyGroupById(groupBId, tenants.businessAId)).toBeNull();
    expect(await findPartyGroupById(groupAId, tenants.businessAId)).not.toBeNull();
  });

  it("findOwnedPartyGroupIds drops ids that belong to another business", async () => {
    const owned = await findOwnedPartyGroupIds(
      [groupAId, groupBId],
      tenants.businessAId,
      "customer",
    );
    expect(owned).toEqual([groupAId]);
  });

  it("soft-deleting a group in business A does not affect business B's group of the same name", async () => {
    await softDeletePartyGroup(groupAId, tenants.businessAId);

    const activeA = await listPartyGroups(tenants.businessAId, "customer", "active");
    const activeB = await listPartyGroups(tenants.businessBId, "customer", "active");
    expect(activeA.map((g) => String(g._id))).not.toContain(groupAId);
    expect(activeB.map((g) => String(g._id))).toContain(groupBId);

    const deletedA = await listPartyGroups(tenants.businessAId, "customer", "deleted");
    expect(deletedA.map((g) => String(g._id))).toContain(groupAId);

    await restorePartyGroup(groupAId, tenants.businessAId);
  });
});
