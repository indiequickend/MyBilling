import { connectToDatabase } from "@/lib/db/connect";
import { Membership } from "@/lib/db/models/Membership";
import { Role } from "@/lib/db/models/Role";
import { User } from "@/lib/db/models/User";

export async function findMembership(userId: string, businessId: string) {
  await connectToDatabase();
  return Membership.findOne({ userId, businessId });
}

export async function findMembershipById(membershipId: string, businessId: string) {
  await connectToDatabase();
  return Membership.findOne({ _id: membershipId, businessId });
}

/** Members of one business, joined with the user's display info and role name. */
export async function listMembershipsForBusiness(businessId: string) {
  await connectToDatabase();
  const memberships = await Membership.find({ businessId }).lean();
  const userIds = memberships.map((m) => m.userId);
  const roleIds = memberships.map((m) => m.roleId);

  const [users, roles] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("name email")
      .lean(),
    Role.find({ _id: { $in: roleIds }, businessId })
      .select("name")
      .lean(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  return memberships.map((m) => ({
    ...m,
    user: userById.get(String(m.userId)) ?? null,
    role: roleById.get(String(m.roleId)) ?? null,
  }));
}

export async function createMembership(input: {
  userId: string;
  businessId: string;
  roleId: string;
  status?: "active" | "deactivated";
}) {
  await connectToDatabase();
  return Membership.create({
    userId: input.userId,
    businessId: input.businessId,
    roleId: input.roleId,
    status: input.status ?? "active",
  });
}

export async function updateMembershipRole(
  membershipId: string,
  businessId: string,
  roleId: string,
) {
  await connectToDatabase();
  return Membership.findOneAndUpdate(
    { _id: membershipId, businessId },
    { $set: { roleId } },
    { returnDocument: "after" },
  );
}

export async function setMembershipStatus(
  membershipId: string,
  businessId: string,
  status: "active" | "deactivated",
) {
  await connectToDatabase();
  return Membership.findOneAndUpdate(
    { _id: membershipId, businessId },
    { $set: { status } },
    { returnDocument: "after" },
  );
}

/** Used to block deactivating/reassigning the last active admin-capable membership. */
export async function countActiveMembershipsWithRole(businessId: string, roleId: string) {
  await connectToDatabase();
  return Membership.countDocuments({ businessId, roleId, status: "active" });
}
