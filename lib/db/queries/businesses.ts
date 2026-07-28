import { connectToDatabase } from "@/lib/db/connect";
import { Business } from "@/lib/db/models/Business";
import { Role } from "@/lib/db/models/Role";
import { Membership } from "@/lib/db/models/Membership";
import { ADMIN_TEMPLATE_PERMISSIONS } from "@/lib/rbac/templates";

/**
 * Creates a Business together with its Admin role and the owning user's Membership
 * as one atomic transaction, so a crash mid-way never leaves an orphaned Business
 * with no admin able to manage it.
 */
export async function createBusinessWithOwner(input: { name: string; ownerUserId: string }) {
  const conn = await connectToDatabase();
  const session = await conn.startSession();

  try {
    let result!: { businessId: string; roleId: string; membershipId: string };

    await session.withTransaction(async () => {
      const [business] = await Business.create(
        [{ name: input.name, createdByUserId: input.ownerUserId }],
        { session },
      );
      const [adminRole] = await Role.create(
        [
          {
            businessId: business._id,
            name: "Admin",
            permissions: ADMIN_TEMPLATE_PERMISSIONS,
            isSystemDefault: true,
          },
        ],
        { session },
      );
      const [membership] = await Membership.create(
        [
          {
            userId: input.ownerUserId,
            businessId: business._id,
            roleId: adminRole._id,
            status: "active",
          },
        ],
        { session },
      );

      result = {
        businessId: String(business._id),
        roleId: String(adminRole._id),
        membershipId: String(membership._id),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export async function findBusinessById(businessId: string) {
  await connectToDatabase();
  return Business.findOne({ _id: businessId, deletedAt: { $exists: false } });
}

/**
 * For the business switcher: every business a user has an active membership
 * in. .lean() — this renders straight into the Sidebar Client Component on
 * every dashboard page, so it must be plain objects, not Mongoose documents.
 */
export async function listBusinessesForUser(userId: string) {
  await connectToDatabase();
  const memberships = await Membership.find({ userId, status: "active" }).lean();
  const businessIds = memberships.map((m) => m.businessId);
  return Business.find({ _id: { $in: businessIds }, deletedAt: { $exists: false } }).lean();
}
