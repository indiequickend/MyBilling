import { connectToDatabase } from "@/lib/db/connect";
import { Invitation } from "@/lib/db/models/Invitation";

export async function createInvitation(input: {
  businessId: string;
  email: string;
  roleId: string;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}) {
  await connectToDatabase();
  return Invitation.create({
    businessId: input.businessId,
    email: input.email.toLowerCase().trim(),
    roleId: input.roleId,
    tokenHash: input.tokenHash,
    invitedByUserId: input.invitedByUserId,
    expiresAt: input.expiresAt,
  });
}

export async function findValidInvitationByTokenHash(tokenHash: string) {
  await connectToDatabase();
  return Invitation.findOne({
    tokenHash,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function markInvitationAccepted(invitationId: string) {
  await connectToDatabase();
  return Invitation.findByIdAndUpdate(
    invitationId,
    { $set: { acceptedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function listPendingInvitationsForBusiness(businessId: string) {
  await connectToDatabase();
  return Invitation.find({
    businessId,
    acceptedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}
