import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectToDatabase } from "@/lib/db/connect";
import { createUser, findUserByEmail } from "@/lib/db/queries/users";
import { createBusinessWithOwner } from "@/lib/db/queries/businesses";
import { listRolesForBusiness, findRoleById, createRole } from "@/lib/db/queries/roles";
import {
  listMembershipsForBusiness,
  findMembership,
  countActiveMembershipsWithRole,
} from "@/lib/db/queries/memberships";
import { User } from "@/lib/db/models/User";
import { Business } from "@/lib/db/models/Business";
import { Role } from "@/lib/db/models/Role";
import { Membership } from "@/lib/db/models/Membership";

/**
 * The single most important test in this codebase per CLAUDE.md: no query
 * touching a tenant-scoped collection may ever return or accept data across a
 * businessId boundary. This creates two independent businesses and asserts
 * every direction of cross-tenant leakage is blocked.
 */
describe("tenant isolation", () => {
  const emailA = `tenant-test-a-${Date.now()}@example.com`;
  const emailB = `tenant-test-b-${Date.now()}@example.com`;

  let userAId: string;
  let userBId: string;
  let businessAId: string;
  let businessBId: string;
  let roleAId: string;
  let roleBId: string;

  beforeAll(async () => {
    await connectToDatabase();

    const userA = await createUser({ email: emailA, passwordHash: "x", name: "Tenant A Owner" });
    const userB = await createUser({ email: emailB, passwordHash: "x", name: "Tenant B Owner" });
    userAId = String(userA._id);
    userBId = String(userB._id);

    const resultA = await createBusinessWithOwner({ name: "Tenant A Co", ownerUserId: userAId });
    const resultB = await createBusinessWithOwner({ name: "Tenant B Co", ownerUserId: userBId });
    businessAId = resultA.businessId;
    businessBId = resultB.businessId;
    roleAId = resultA.roleId;
    roleBId = resultB.roleId;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({ _id: { $in: [userAId, userBId] } }),
      Business.deleteMany({ _id: { $in: [businessAId, businessBId] } }),
      Role.deleteMany({ businessId: { $in: [businessAId, businessBId] } }),
      Membership.deleteMany({ businessId: { $in: [businessAId, businessBId] } }),
    ]);
  });

  it("createUser + createBusinessWithOwner set up two independent tenants", async () => {
    expect(await findUserByEmail(emailA)).not.toBeNull();
    expect(businessAId).not.toBe(businessBId);
  });

  it("listRolesForBusiness never returns another business's roles", async () => {
    const rolesA = await listRolesForBusiness(businessAId);
    expect(rolesA.map((r) => String(r._id))).toContain(roleAId);
    expect(rolesA.map((r) => String(r._id))).not.toContain(roleBId);
  });

  it("listMembershipsForBusiness never returns another business's members", async () => {
    const membersA = await listMembershipsForBusiness(businessAId);
    expect(membersA.map((m) => String(m.userId))).toContain(userAId);
    expect(membersA.map((m) => String(m.userId))).not.toContain(userBId);
  });

  it("findRoleById refuses a role id that belongs to a different business", async () => {
    // roleBId is a real role, but scoped-lookup under businessAId must not find it.
    expect(await findRoleById(roleBId, businessAId)).toBeNull();
    expect(await findRoleById(roleAId, businessAId)).not.toBeNull();
  });

  it("findMembership refuses a user who has no membership in that business", async () => {
    expect(await findMembership(userBId, businessAId)).toBeNull();
    expect(await findMembership(userAId, businessAId)).not.toBeNull();
  });

  it("countActiveMembershipsWithRole is scoped per business", async () => {
    // Creating an identically-permissioned role in business A must not affect business B's count.
    const extraRole = await createRole({
      businessId: businessAId,
      name: "Extra",
      permissions: {},
    });
    const countB = await countActiveMembershipsWithRole(businessBId, String(extraRole._id));
    expect(countB).toBe(0);
    await Role.deleteOne({ _id: extraRole._id });
  });
});
