"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  findBusinessById,
  updateBusinessDetails,
  setBusinessCustomFieldDefs,
  setBusinessCustomFieldValues,
} from "@/lib/db/queries/businesses";
import {
  businessDetailsSchema,
  businessAddressesSchema,
  businessCustomFieldDefsSchema,
  buildCustomFieldValuesSchema,
} from "@/lib/validation/business";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import { uploadFile, deleteFile } from "@/lib/storage/cloudinary";
import { detectImageMimeType } from "@/lib/storage/imageMime";

export type CompanyPageState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

async function requireManageCompany() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_company");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function updateCompanyDetailsAction(
  _prev: CompanyPageState,
  formData: FormData,
): Promise<CompanyPageState> {
  const context = await requireManageCompany();

  const parsed = businessDetailsSchema.safeParse({
    name: formData.get("name"),
    brandName: formData.get("brandName"),
    gstin: formData.get("gstin"),
    pan: formData.get("pan"),
    businessType: formData.get("businessType"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    alternateContact: formData.get("alternateContact"),
    website: formData.get("website"),
  });
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const addressesParsed = businessAddressesSchema.safeParse({
    billing: parseAddressFromFormData(formData, "billing"),
    shipping: parseAddressFromFormData(formData, "shipping"),
  });
  if (!addressesParsed.success) {
    return { error: "Fix the address fields and try again." };
  }

  let logoUpdate: { logoPublicId?: string; logoUrl?: string } = {};
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType) {
      return { error: "Logo must be a PNG, JPEG, or WEBP image." };
    }
    const uploaded = await uploadFile(buffer, mimeType, {
      folder: `businesses/${context.activeBusinessId}/logos`,
    });
    const existing = await findBusinessById(context.activeBusinessId);
    if (existing?.logoPublicId) {
      await deleteFile(existing.logoPublicId).catch(() => {});
    }
    logoUpdate = { logoPublicId: uploaded.publicId, logoUrl: uploaded.url };
  }

  await updateBusinessDetails(context.activeBusinessId, {
    ...parsed.data,
    addresses: addressesParsed.data,
    ...logoUpdate,
  });

  revalidatePath("/settings/company");
  return { success: "Company details saved." };
}

function parseCustomFieldDefsFromFormData(formData: FormData) {
  const rows = new Map<number, Record<string, unknown>>();
  for (const key of formData.keys()) {
    const match = /^customFieldDef__(\d+)__(.+)$/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2];
    if (!rows.has(index)) rows.set(index, { required: false });
    const row = rows.get(index)!;
    if (field === "options") {
      row.options = String(formData.get(key) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (field === "required") {
      row.required = formData.get(key) != null;
    } else {
      row[field] = formData.get(key);
    }
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

export async function updateCustomFieldDefsAction(
  _prev: CompanyPageState,
  formData: FormData,
): Promise<CompanyPageState> {
  const context = await requireManageCompany();

  const defs = parseCustomFieldDefsFromFormData(formData);
  const parsed = businessCustomFieldDefsSchema.safeParse(defs);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await setBusinessCustomFieldDefs(context.activeBusinessId, parsed.data);
  revalidatePath("/settings/company");
  return { success: "Custom fields updated." };
}

export async function updateCustomFieldValuesAction(
  _prev: CompanyPageState,
  formData: FormData,
): Promise<CompanyPageState> {
  const context = await requireManageCompany();

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const raw: Record<string, unknown> = {};
  for (const def of business.customFieldDefs) {
    raw[def.key] = formData.get(def.key);
  }
  const schema = buildCustomFieldValuesSchema(business.customFieldDefs);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  await setBusinessCustomFieldValues(context.activeBusinessId, parsed.data);
  revalidatePath("/settings/company");
  return { success: "Field values saved." };
}
