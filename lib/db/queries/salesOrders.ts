import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { SalesOrder, type SalesOrderLineItemDoc, type SalesOrderStatus } from "@/lib/db/models/SalesOrder";
import { Business } from "@/lib/db/models/Business";
import { Customer } from "@/lib/db/models/Customer";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type SalesOrderLineItemWriteInput = {
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

export type SalesOrderWriteInput = {
  businessId: string;
  customerId: string;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: SalesOrderLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  customFieldValues?: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
  sourceQuotationId?: string;
};

export type CreateSalesOrderInput = SalesOrderWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type SalesOrderWriteFailureReason =
  | "customer_not_found"
  | "invalid_note_template"
  | "invalid_term_template"
  | "business_not_found"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type SalesOrderWriteResult =
  | { ok: true; salesOrder: InstanceType<typeof SalesOrder> }
  | { ok: false; reason: SalesOrderWriteFailureReason };

const EDITABLE_STATUSES: SalesOrderStatus[] = ["draft", "open"];
const CANCELLABLE_STATUSES: SalesOrderStatus[] = ["draft", "open"];
const DELETABLE_STATUSES: SalesOrderStatus[] = ["draft", "cancelled"];

function buildCustomerSnapshot(customer: InstanceType<typeof Customer>) {
  return {
    displayName: customer.displayName,
    gstin: customer.gstin ?? undefined,
    billingAddress: toPlainAddress(customer.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(customer.shippingAddress) ?? undefined,
  };
}

async function assertOwnedSalesOrderReferences(params: {
  businessId: string;
  customerId: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; customer: InstanceType<typeof Customer> }
  | { ok: false; reason: SalesOrderWriteFailureReason }
> {
  const customer = await Customer.findOne({
    _id: params.customerId,
    businessId: params.businessId,
    deletedAt: { $exists: false },
  });
  if (!customer) return { ok: false, reason: "customer_not_found" };

  if (params.noteTemplateId && !(await isOwnedNoteTermTemplate(params.noteTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_note_template" };
  }
  if (params.termTemplateId && !(await isOwnedNoteTermTemplate(params.termTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_term_template" };
  }
  return { ok: true, customer };
}

type PreparedSalesOrderWrite = {
  ok: true;
  customer: InstanceType<typeof Customer>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: SalesOrderLineItemDoc[];
};

async function prepareSalesOrderWrite(
  input: SalesOrderWriteInput,
): Promise<PreparedSalesOrderWrite | { ok: false; reason: SalesOrderWriteFailureReason }> {
  const ownership = await assertOwnedSalesOrderReferences(input);
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

  const lineItemDocs: SalesOrderLineItemDoc[] = input.lineItems.map((li, i) => ({
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
    itcEligible: true,
  })) as SalesOrderLineItemDoc[];

  return { ok: true, customer: ownership.customer, business, totals, lineItemDocs };
}

function buildSalesOrderSetFields(input: SalesOrderWriteInput, prepared: PreparedSalesOrderWrite) {
  return {
    customerId: prepared.customer._id,
    customerSnapshot: buildCustomerSnapshot(prepared.customer),
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

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<SalesOrderWriteResult> {
  await connectToDatabase();

  const prepared = await prepareSalesOrderWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: SalesOrderWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "sales_order");
        seriesKey = resolveSeriesKey(input.orderDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "sales_order", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [salesOrderDoc] = await SalesOrder.create(
        [
          {
            businessId: input.businessId,
            ...buildSalesOrderSetFields(input, prepared),
            sourceQuotationId: input.sourceQuotationId,
            docNumber,
            seriesKey,
            status: input.finalize ? "open" : "draft",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      result = { ok: true, salesOrder: salesOrderDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Edits a draft/open sales order; closed/cancelled ones are immutable. Not transactional — a
 * single document update, no numbering. */
export async function updateSalesOrder(
  salesOrderId: string,
  businessId: string,
  input: SalesOrderWriteInput,
): Promise<SalesOrderWriteResult> {
  await connectToDatabase();
  const existing = await SalesOrder.findOne({
    _id: salesOrderId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await prepareSalesOrderWrite(input);
  if (!prepared.ok) return prepared;

  const updated = await SalesOrder.findOneAndUpdate(
    { _id: salesOrderId, businessId },
    { $set: buildSalesOrderSetFields(input, prepared) },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, salesOrder: updated };
}

class SalesOrderNoLongerDraftError extends Error {}

/** Turns a draft into a numbered, open sales order. */
export async function finalizeSalesOrderDraft(
  salesOrderId: string,
  businessId: string,
  input: SalesOrderWriteInput,
): Promise<SalesOrderWriteResult> {
  await connectToDatabase();
  const existing = await SalesOrder.findOne({
    _id: salesOrderId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await prepareSalesOrderWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: SalesOrderWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "sales_order");
        const seriesKey = resolveSeriesKey(input.orderDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "sales_order", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await SalesOrder.findOneAndUpdate(
          { _id: salesOrderId, businessId, status: "draft" },
          { $set: { ...buildSalesOrderSetFields(input, prepared), docNumber, seriesKey, status: "open" } },
          { returnDocument: "after", session },
        );
        if (!updated) throw new SalesOrderNoLongerDraftError();

        result = { ok: true, salesOrder: updated };
      });
    } catch (err) {
      if (err instanceof SalesOrderNoLongerDraftError) return { ok: false, reason: "not_editable" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelSalesOrder(
  salesOrderId: string,
  businessId: string,
): Promise<SalesOrderWriteResult> {
  await connectToDatabase();
  const updated = await SalesOrder.findOneAndUpdate(
    { _id: salesOrderId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, salesOrder: updated };
}

/** Called once the source sales order's Invoice has been created — see sales/invoices/actions.ts.
 * Silently no-ops if the sales order is already closed/cancelled/foreign, since the created
 * Invoice is the source of truth once it exists; this is traceability bookkeeping only. */
export async function markSalesOrderClosed(salesOrderId: string, businessId: string): Promise<void> {
  await connectToDatabase();
  await SalesOrder.findOneAndUpdate(
    { _id: salesOrderId, businessId, status: "open" },
    { $set: { status: "closed" } },
  );
}

export async function softDeleteSalesOrder(
  salesOrderId: string,
  businessId: string,
): Promise<SalesOrderWriteResult> {
  await connectToDatabase();
  const updated = await SalesOrder.findOneAndUpdate(
    { _id: salesOrderId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, salesOrder: updated };
}

export async function restoreSalesOrder(salesOrderId: string, businessId: string) {
  await connectToDatabase();
  return SalesOrder.findOneAndUpdate(
    { _id: salesOrderId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findSalesOrderById(salesOrderId: string, businessId: string) {
  await connectToDatabase();
  return SalesOrder.findOne({ _id: salesOrderId, businessId });
}

export type SalesOrderListParams = {
  search?: string;
  customerId?: string;
  tab?: "all" | "draft" | "open" | "closed" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

function buildSalesOrderFilter(
  businessId: string,
  params: Omit<SalesOrderListParams, "page" | "pageSize">,
  options: { forAggregate?: boolean } = {},
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    businessId: options.forAggregate ? new mongoose.Types.ObjectId(businessId) : businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.customerId) {
    filter.customerId = options.forAggregate
      ? new mongoose.Types.ObjectId(params.customerId)
      : params.customerId;
  }
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ docNumber: pattern }, { referenceNumber: pattern }, { "customerSnapshot.displayName": pattern }];
  }
  return filter;
}

export async function listSalesOrders(businessId: string, params: SalesOrderListParams = {}) {
  await connectToDatabase();
  const filter = buildSalesOrderFilter(businessId, params);
  return paginate(SalesOrder, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { orderDate: -1, createdAt: -1 },
  });
}

export type SalesOrderTotalsSummary = { totalMinor: number };

export async function sumSalesOrderTotals(
  businessId: string,
  params: Omit<SalesOrderListParams, "page" | "pageSize"> = {},
): Promise<SalesOrderTotalsSummary> {
  await connectToDatabase();
  const filter = buildSalesOrderFilter(businessId, params, { forAggregate: true });
  const [agg] = await SalesOrder.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" } } },
  ]);
  return { totalMinor: agg?.totalMinor ?? 0 };
}
