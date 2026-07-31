"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { partyGroupSchema } from "@/lib/validation/partyGroups";
import {
  createPartyGroup,
  updatePartyGroup,
  softDeletePartyGroup,
  restorePartyGroup,
} from "@/lib/db/queries/partyGroups";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type PartyGroupFormState = { error?: string };

async function requireGroupsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "vendors", "edit");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function createVendorGroupAction(
  _prev: PartyGroupFormState,
  formData: FormData,
): Promise<PartyGroupFormState> {
  const context = await requireGroupsPermission();
  const parsed = partyGroupSchema.safeParse({ type: "vendor", name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await createPartyGroup({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/vendors/groups");
  return {};
}

export async function updateVendorGroupAction(formData: FormData): Promise<void> {
  const context = await requireGroupsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!groupId || !name) return;
  await updatePartyGroup(groupId, context.activeBusinessId, { name });
  revalidatePath("/vendors/groups");
}

export async function softDeleteVendorGroupAction(formData: FormData): Promise<void> {
  const context = await requireGroupsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  const group = await softDeletePartyGroup(groupId, context.activeBusinessId);
  if (group) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "vendor_group.deleted",
      target: { type: "vendor_group", id: groupId, label: group.name },
    });
  }
  revalidatePath("/vendors/groups");
}

export async function restoreVendorGroupAction(formData: FormData): Promise<void> {
  const context = await requireGroupsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  const group = await restorePartyGroup(groupId, context.activeBusinessId);
  if (group) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "vendor_group.restored",
      target: { type: "vendor_group", id: groupId, label: group.name },
    });
  }
  revalidatePath("/vendors/groups");
}
