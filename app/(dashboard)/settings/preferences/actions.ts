"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  updateDocumentPreferences,
  updateProductsInventoryPreferences,
  updateDocumentNumberingPreferences,
} from "@/lib/db/queries/businesses";
import {
  documentPreferencesFormSchema,
  productsInventoryPreferencesFormSchema,
  documentNumberingFormSchema,
} from "@/lib/validation/preferences";
import { parseCheckbox } from "@/lib/validation/shared";

export type PreferencesPageState = { error?: string; success?: string };

async function requireManagePreferences() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_preferences");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function docPrefsFromForm(formData: FormData, category: "sales" | "purchases" | "conversions") {
  return {
    roundOff: parseCheckbox(formData, `${category}__roundOff`),
    defaultDiscountType: String(formData.get(`${category}__defaultDiscountType`) ?? "percentage"),
    showHeaderFieldSuggestions: parseCheckbox(formData, `${category}__showHeaderFieldSuggestions`),
    defaultDueDateDays: formData.get(`${category}__defaultDueDateDays`),
  };
}

export async function updateDocumentPreferencesAction(
  _prev: PreferencesPageState,
  formData: FormData,
): Promise<PreferencesPageState> {
  const context = await requireManagePreferences();

  const parsed = documentPreferencesFormSchema.safeParse({
    sales: docPrefsFromForm(formData, "sales"),
    purchases: docPrefsFromForm(formData, "purchases"),
    conversions: docPrefsFromForm(formData, "conversions"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateDocumentPreferences(context.activeBusinessId, parsed.data);
  revalidatePath("/settings/preferences/document");
  return { success: "Document preferences saved." };
}

export async function updateDocumentNumberingAction(
  _prev: PreferencesPageState,
  formData: FormData,
): Promise<PreferencesPageState> {
  const context = await requireManagePreferences();

  const parsed = documentNumberingFormSchema.safeParse({
    fyStartMonth: formData.get("fyStartMonth"),
    configs: {
      invoice: {
        prefix: formData.get("invoice__prefix"),
        padding: formData.get("invoice__padding"),
        resetPolicy: formData.get("invoice__resetPolicy"),
      },
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateDocumentNumberingPreferences(context.activeBusinessId, parsed.data);
  revalidatePath("/settings/preferences/document");
  return { success: "Document numbering saved." };
}

export async function updateProductsInventoryPreferencesAction(
  _prev: PreferencesPageState,
  formData: FormData,
): Promise<PreferencesPageState> {
  const context = await requireManagePreferences();

  const parsed = productsInventoryPreferencesFormSchema.safeParse({
    product: {
      defaultItemType: formData.get("product__defaultItemType"),
      defaultPriceInclusiveOfTax: parseCheckbox(formData, "product__defaultPriceInclusiveOfTax"),
      maxDiscountPercent: formData.get("product__maxDiscountPercent"),
      defaultUnit: formData.get("product__defaultUnit"),
      defaultTaxRatePercent: formData.get("product__defaultTaxRatePercent"),
    },
    inventory: {
      trackInventory: parseCheckbox(formData, "inventory__trackInventory"),
      defaultWarehouseId: formData.get("inventory__defaultWarehouseId"),
    },
    batch: {
      batchTrackingEnabledByDefault: parseCheckbox(
        formData,
        "batch__batchTrackingEnabledByDefault",
      ),
      expiryTrackingEnabledByDefault: parseCheckbox(
        formData,
        "batch__expiryTrackingEnabledByDefault",
      ),
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateProductsInventoryPreferences(context.activeBusinessId, parsed.data);
  revalidatePath("/settings/preferences/products-inventory");
  return { success: "Product & inventory preferences saved." };
}
