"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { gstPeriodSchema } from "@/lib/validation/gst";
import { computeGstr3b } from "@/lib/db/queries/gstReports";
import { upsertGstReportSnapshot } from "@/lib/db/queries/gstReportSnapshots";

async function requireGstEdit(): Promise<{ businessId: string; userId: string }> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "gst", "edit");
  return { businessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function recomputeGstr3bAction(formData: FormData): Promise<void> {
  const { businessId, userId } = await requireGstEdit();
  const period = gstPeriodSchema.parse(String(formData.get("period") ?? ""));
  const computedData = await computeGstr3b(businessId, period);
  await upsertGstReportSnapshot(businessId, "gstr3b", period, computedData, userId);
  revalidatePath("/gst/gstr3b");
  redirect(`/gst/gstr3b?period=${period}`);
}
