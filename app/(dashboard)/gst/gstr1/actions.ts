"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { gstPeriodSchema, markGstr1FiledSchema } from "@/lib/validation/gst";
import { computeGstr1 } from "@/lib/db/queries/gstReports";
import { upsertGstReportSnapshot, markGstr1Filed, unmarkGstr1Filed } from "@/lib/db/queries/gstReportSnapshots";

export type GstActionState = { error?: string };

async function requireGstEdit(): Promise<{ businessId: string; userId: string }> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "gst", "edit");
  return { businessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function recomputeGstr1Action(formData: FormData): Promise<void> {
  const { businessId, userId } = await requireGstEdit();
  const period = gstPeriodSchema.parse(String(formData.get("period") ?? ""));
  const computedData = await computeGstr1(businessId, period);
  await upsertGstReportSnapshot(businessId, "gstr1", period, computedData, userId);
  revalidatePath("/gst/gstr1");
  redirect(`/gst/gstr1?period=${period}`);
}

export async function markGstr1FiledAction(
  _prev: GstActionState,
  formData: FormData,
): Promise<GstActionState> {
  const { businessId, userId } = await requireGstEdit();
  const parsed = markGstr1FiledSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return { error: "Select a valid period" };
  await markGstr1Filed(businessId, parsed.data.period, userId);
  revalidatePath("/gst/gstr1");
  revalidatePath("/gst/gstr1/tracker");
  return {};
}

export async function unmarkGstr1FiledAction(
  _prev: GstActionState,
  formData: FormData,
): Promise<GstActionState> {
  const { businessId } = await requireGstEdit();
  const parsed = markGstr1FiledSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return { error: "Select a valid period" };
  await unmarkGstr1Filed(businessId, parsed.data.period);
  revalidatePath("/gst/gstr1");
  revalidatePath("/gst/gstr1/tracker");
  return {};
}
