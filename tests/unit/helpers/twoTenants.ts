import { connectToDatabase } from "@/lib/db/connect";
import { createUser } from "@/lib/db/queries/users";
import { createBusinessWithOwner } from "@/lib/db/queries/businesses";
import { User } from "@/lib/db/models/User";
import { Business } from "@/lib/db/models/Business";
import { Role } from "@/lib/db/models/Role";
import { Membership } from "@/lib/db/models/Membership";

export type TwoTenants = {
  userAId: string;
  userBId: string;
  businessAId: string;
  businessBId: string;
  roleAId: string;
  roleBId: string;
};

/**
 * Shared two-business bootstrap for every tenant-isolation test file under
 * tests/unit/tenant-isolation/*.test.ts — factored out of the original
 * tests/unit/tenant-isolation.test.ts (left as-is) so each new domain's test
 * file isn't duplicating ~40 lines of setup.
 */
export async function setupTwoTenants(label: string): Promise<TwoTenants> {
  await connectToDatabase();

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userA = await createUser({
    email: `${label}-a-${unique}@example.com`,
    passwordHash: "x",
    name: "Tenant A Owner",
  });
  const userB = await createUser({
    email: `${label}-b-${unique}@example.com`,
    passwordHash: "x",
    name: "Tenant B Owner",
  });

  const resultA = await createBusinessWithOwner({
    name: `${label} Tenant A Co`,
    ownerUserId: String(userA._id),
  });
  const resultB = await createBusinessWithOwner({
    name: `${label} Tenant B Co`,
    ownerUserId: String(userB._id),
  });

  return {
    userAId: String(userA._id),
    userBId: String(userB._id),
    businessAId: resultA.businessId,
    businessBId: resultB.businessId,
    roleAId: resultA.roleId,
    roleBId: resultB.roleId,
  };
}

export async function teardownTwoTenants(tenants: TwoTenants): Promise<void> {
  await Promise.all([
    User.deleteMany({ _id: { $in: [tenants.userAId, tenants.userBId] } }),
    Business.deleteMany({ _id: { $in: [tenants.businessAId, tenants.businessBId] } }),
    Role.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } }),
    Membership.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } }),
  ]);
}
