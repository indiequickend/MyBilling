import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { PurchaseOrder, type PurchaseOrderLineItemDoc, type PurchaseOrderStatus } from "@/lib/db/models/PurchaseOrder";
import { Business } from "@/lib/db/models/Business";
import { Vendor } from "@/lib/db/models/Vendor";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type PurchaseOrderLineItemWriteInput = {
  productId?: string;
  variantId?: string;
  description: string;
  notes?: string;
  hsnOrSac?: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: "amount" | "percentage";
  discountValue: number;
  taxRatePercent: number;
};

export type PurchaseOrderWriteInput = {
  businessId: string;
  vendorId: string;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: PurchaseOrderLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  customFieldValues?: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
};

export type CreatePurchaseOrderInput = PurchaseOrderWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type PurchaseOrderWriteFailureReason =
  | "vendor_not_found"
  | "invalid_note_template"
  | "invalid_term_template"
  | "business_not_found"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type PurchaseOrderWriteResult =
  | { ok: true; purchaseOrder: InstanceType<typeof PurchaseOrder> }
  | { ok: false; reason: PurchaseOrderWriteFailureReason };

const EDITABLE_STATUSES: PurchaseOrderStatus[] = ["draft", "open"];
const CANCELLABLE_STATUSES: PurchaseOrderStatus[] = ["draft", "open"];
const DELETABLE_STATUSES: PurchaseOrderStatus[] = ["draft", "cancelled"];

function buildVendorSnapshot(vendor: InstanceType<typeof Vendor>) {
  return {
    displayName: vendor.displayName,
    gstin: vendor.gstin ?? undefined,
    billingAddress: toPlainAddress(vendor.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(vendor.shippingAddress) ?? undefined,
  };
}

async function assertOwnedPurchaseOrderReferences(params: {
  businessId: string;
  vendorId: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; vendor: InstanceType<typeof Vendor> }
  | { ok: false; reason: PurchaseOrderWriteFailureReason }
> {
  const vendor = await Vendor.findOne({
    _id: params.vendorId,
    businessId: params.businessId,
    deletedAt: { $exists: false },
  });
  if (!vendor) return { ok: false, reason: "vendor_not_found" };

  if (params.noteTemplateId && !(await isOwnedNoteTermTemplate(params.noteTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_note_template" };
  }
  if (params.termTemplateId && !(await isOwnedNoteTermTemplate(params.termTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_term_template" };
  }
  return { ok: true, vendor };
}

type PreparedPurchaseOrderWrite = {
  ok: true;
  vendor: InstanceType<typeof Vendor>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: PurchaseOrderLineItemDoc[];
};

async function preparePurchaseOrderWrite(
  input: PurchaseOrderWriteInput,
): Promise<PreparedPurchaseOrderWrite | { ok: false; reason: PurchaseOrderWriteFailureReason }> {
  const ownership = await assertOwnedPurchaseOrderReferences(input);
  if (!ownership.ok) return ownership;

  const business = await Business.findOne({ _id: input.businessId, deletedAt: { $exists: false } });
  if (!business) return { ok: false, reason: "business_not_found" };

  const businessState = business.addresses?.billing?.state ?? "";
  const lineItemCalcInputs: LineItemCalcInput[] = input.lineItems.map((li) => ({
    quantity: li.quantity,
    unitPriceMinor: li.unitPriceMinor,
    discountType: li.discountType,
    discountValue: li.discountValue,
    taxRatePercent: li.taxRatePercent,
  }));

  const totals = computeDocumentTotals(
    lineItemCalcInputs,
    { type: input.discountType, value: input.discountValue, target: input.discountTarget },
    input.roundOff,
    businessState,
    input.placeOfSupplyState,
  );

  const lineItemDocs: PurchaseOrderLineItemDoc[] = input.lineItems.map((li, i) => ({
    productId: li.productId ? new mongoose.Types.ObjectId(li.productId) : undefined,
    variantId: li.variantId ? new mongoose.Types.ObjectId(li.variantId) : undefined,
    description: li.description,
    notes: li.notes,
    hsnOrSac: li.hsnOrSac,
    unit: li.unit ?? "PCS",
    quantity: li.quantity,
    unitPriceMinor: li.unitPriceMinor,
    discountType: li.discountType,
    discountValue: li.discountValue,
    taxRatePercent: li.taxRatePercent,
    cgstMinor: totals.lineItems[i].cgstMinor,
    sgstMinor: totals.lineItems[i].sgstMinor,
    igstMinor: totals.lineItems[i].igstMinor,
    taxableAmountMinor: totals.lineItems[i].taxableAmountMinor,
    totalMinor: totals.lineItems[i].totalMinor,
    // Purchase Orders don't track ITC eligibility — only meaningful once billed as a Purchase.
    itcEligible: true,
  })) as PurchaseOrderLineItemDoc[];

  return { ok: true, vendor: ownership.vendor, business, totals, lineItemDocs };
}

function buildPurchaseOrderSetFields(input: PurchaseOrderWriteInput, prepared: PreparedPurchaseOrderWrite) {
  return {
    vendorId: prepared.vendor._id,
    vendorSnapshot: buildVendorSnapshot(prepared.vendor),
    orderDate: input.orderDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
    referenceNumber: input.referenceNumber,
    placeOfSupplyState: input.placeOfSupplyState,
    reverseCharge: input.reverseCharge,
    lineItems: prepared.lineItemDocs,
    discountType: input.discountType,
    discountValue: input.discountValue,
    discountTarget: input.discountTarget,
    discountAmountMinor: prepared.totals.discountAmountMinor,
    roundOff: input.roundOff,
    roundOffAmountMinor: prepared.totals.roundOffAmountMinor,
    subtotalMinor: prepared.totals.subtotalMinor,
    totalTaxMinor: prepared.totals.totalTaxMinor,
    totalCgstMinor: prepared.totals.totalCgstMinor,
    totalSgstMinor: prepared.totals.totalSgstMinor,
    totalIgstMinor: prepared.totals.totalIgstMinor,
    grandTotalMinor: prepared.totals.grandTotalMinor,
    customFieldValues: input.customFieldValues ?? {},
    notes: input.notes,
    terms: input.terms,
    noteTemplateId: input.noteTemplateId,
    termTemplateId: input.termTemplateId,
  };
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWriteResult> {
  await connectToDatabase();

  const prepared = await preparePurchaseOrderWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: PurchaseOrderWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "purchase_order");
        seriesKey = resolveSeriesKey(input.orderDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "purchase_order", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [poDoc] = await PurchaseOrder.create(
        [
          {
            businessId: input.businessId,
            ...buildPurchaseOrderSetFields(input, prepared),
            docNumber,
            seriesKey,
            status: input.finalize ? "open" : "draft",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      result = { ok: true, purchaseOrder: poDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Edits a draft/open purchase order; closed/cancelled ones are immutable. Not transactional —
 * a single document update, no numbering. */
export async function updatePurchaseOrder(
  purchaseOrderId: string,
  businessId: string,
  input: PurchaseOrderWriteInput,
): Promise<PurchaseOrderWriteResult> {
  await connectToDatabase();
  const existing = await PurchaseOrder.findOne({
    _id: purchaseOrderId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await preparePurchaseOrderWrite(input);
  if (!prepared.ok) return prepared;

  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: purchaseOrderId, businessId },
    { $set: buildPurchaseOrderSetFields(input, prepared) },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, purchaseOrder: updated };
}

class PurchaseOrderNoLongerDraftError extends Error {}

/** Turns a draft into a numbered, open purchase order. */
export async function finalizePurchaseOrderDraft(
  purchaseOrderId: string,
  businessId: string,
  input: PurchaseOrderWriteInput,
): Promise<PurchaseOrderWriteResult> {
  await connectToDatabase();
  const existing = await PurchaseOrder.findOne({
    _id: purchaseOrderId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await preparePurchaseOrderWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: PurchaseOrderWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "purchase_order");
        const seriesKey = resolveSeriesKey(input.orderDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "purchase_order", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await PurchaseOrder.findOneAndUpdate(
          { _id: purchaseOrderId, businessId, status: "draft" },
          { $set: { ...buildPurchaseOrderSetFields(input, prepared), docNumber, seriesKey, status: "open" } },
          { returnDocument: "after", session },
        );
        if (!updated) throw new PurchaseOrderNoLongerDraftError();

        result = { ok: true, purchaseOrder: updated };
      });
    } catch (err) {
      if (err instanceof PurchaseOrderNoLongerDraftError) return { ok: false, reason: "not_editable" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelPurchaseOrder(
  purchaseOrderId: string,
  businessId: string,
): Promise<PurchaseOrderWriteResult> {
  await connectToDatabase();
  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: purchaseOrderId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, purchaseOrder: updated };
}

/** Called once the source PO's Purchase has been created — see purchases/actions.ts's
 * savePurchaseAction. Silently no-ops if the PO is already closed/cancelled/foreign, since the
 * Purchase itself is the source of truth once created; this is traceability bookkeeping only. */
export async function markPurchaseOrderClosed(purchaseOrderId: string, businessId: string): Promise<void> {
  await connectToDatabase();
  await PurchaseOrder.findOneAndUpdate(
    { _id: purchaseOrderId, businessId, status: "open" },
    { $set: { status: "closed" } },
  );
}

export async function softDeletePurchaseOrder(
  purchaseOrderId: string,
  businessId: string,
): Promise<PurchaseOrderWriteResult> {
  await connectToDatabase();
  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: purchaseOrderId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, purchaseOrder: updated };
}

export async function restorePurchaseOrder(purchaseOrderId: string, businessId: string) {
  await connectToDatabase();
  return PurchaseOrder.findOneAndUpdate(
    { _id: purchaseOrderId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findPurchaseOrderById(purchaseOrderId: string, businessId: string) {
  await connectToDatabase();
  return PurchaseOrder.findOne({ _id: purchaseOrderId, businessId });
}

export type PurchaseOrderListParams = {
  search?: string;
  vendorId?: string;
  tab?: "all" | "draft" | "open" | "closed" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listPurchaseOrders(businessId: string, params: PurchaseOrderListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.vendorId) filter.vendorId = params.vendorId;
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ docNumber: pattern }, { referenceNumber: pattern }, { "vendorSnapshot.displayName": pattern }];
  }
  return paginate(PurchaseOrder, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { orderDate: -1, createdAt: -1 },
  });
}
