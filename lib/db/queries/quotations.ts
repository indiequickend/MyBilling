import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Quotation, type QuotationLineItemDoc, type QuotationStatus } from "@/lib/db/models/Quotation";
import { Business } from "@/lib/db/models/Business";
import { Customer } from "@/lib/db/models/Customer";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type QuotationLineItemWriteInput = {
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

export type QuotationWriteInput = {
  businessId: string;
  customerId: string;
  quotationDate: Date;
  validUntil?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: QuotationLineItemWriteInput[];
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

export type CreateQuotationInput = QuotationWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type QuotationWriteFailureReason =
  | "customer_not_found"
  | "invalid_note_template"
  | "invalid_term_template"
  | "business_not_found"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type QuotationWriteResult =
  | { ok: true; quotation: InstanceType<typeof Quotation> }
  | { ok: false; reason: QuotationWriteFailureReason };

const EDITABLE_STATUSES: QuotationStatus[] = ["draft", "open"];
const CANCELLABLE_STATUSES: QuotationStatus[] = ["draft", "open"];
const DELETABLE_STATUSES: QuotationStatus[] = ["draft", "cancelled"];

function buildCustomerSnapshot(customer: InstanceType<typeof Customer>) {
  return {
    displayName: customer.displayName,
    gstin: customer.gstin ?? undefined,
    billingAddress: toPlainAddress(customer.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(customer.shippingAddress) ?? undefined,
  };
}

async function assertOwnedQuotationReferences(params: {
  businessId: string;
  customerId: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; customer: InstanceType<typeof Customer> }
  | { ok: false; reason: QuotationWriteFailureReason }
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

type PreparedQuotationWrite = {
  ok: true;
  customer: InstanceType<typeof Customer>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: QuotationLineItemDoc[];
};

async function prepareQuotationWrite(
  input: QuotationWriteInput,
): Promise<PreparedQuotationWrite | { ok: false; reason: QuotationWriteFailureReason }> {
  const ownership = await assertOwnedQuotationReferences(input);
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

  const lineItemDocs: QuotationLineItemDoc[] = input.lineItems.map((li, i) => ({
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
  })) as QuotationLineItemDoc[];

  return { ok: true, customer: ownership.customer, business, totals, lineItemDocs };
}

function buildQuotationSetFields(input: QuotationWriteInput, prepared: PreparedQuotationWrite) {
  return {
    customerId: prepared.customer._id,
    customerSnapshot: buildCustomerSnapshot(prepared.customer),
    quotationDate: input.quotationDate,
    validUntil: input.validUntil,
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

export async function createQuotation(input: CreateQuotationInput): Promise<QuotationWriteResult> {
  await connectToDatabase();

  const prepared = await prepareQuotationWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: QuotationWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "quotation");
        seriesKey = resolveSeriesKey(input.quotationDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "quotation", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [quotationDoc] = await Quotation.create(
        [
          {
            businessId: input.businessId,
            ...buildQuotationSetFields(input, prepared),
            docNumber,
            seriesKey,
            status: input.finalize ? "open" : "draft",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      result = { ok: true, quotation: quotationDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Edits a draft/open quotation; closed/cancelled ones are immutable. Not transactional — a
 * single document update, no numbering. */
export async function updateQuotation(
  quotationId: string,
  businessId: string,
  input: QuotationWriteInput,
): Promise<QuotationWriteResult> {
  await connectToDatabase();
  const existing = await Quotation.findOne({
    _id: quotationId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await prepareQuotationWrite(input);
  if (!prepared.ok) return prepared;

  const updated = await Quotation.findOneAndUpdate(
    { _id: quotationId, businessId },
    { $set: buildQuotationSetFields(input, prepared) },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, quotation: updated };
}

class QuotationNoLongerDraftError extends Error {}

/** Turns a draft into a numbered, open quotation. */
export async function finalizeQuotationDraft(
  quotationId: string,
  businessId: string,
  input: QuotationWriteInput,
): Promise<QuotationWriteResult> {
  await connectToDatabase();
  const existing = await Quotation.findOne({
    _id: quotationId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await prepareQuotationWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: QuotationWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "quotation");
        const seriesKey = resolveSeriesKey(input.quotationDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "quotation", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await Quotation.findOneAndUpdate(
          { _id: quotationId, businessId, status: "draft" },
          { $set: { ...buildQuotationSetFields(input, prepared), docNumber, seriesKey, status: "open" } },
          { returnDocument: "after", session },
        );
        if (!updated) throw new QuotationNoLongerDraftError();

        result = { ok: true, quotation: updated };
      });
    } catch (err) {
      if (err instanceof QuotationNoLongerDraftError) return { ok: false, reason: "not_editable" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelQuotation(
  quotationId: string,
  businessId: string,
): Promise<QuotationWriteResult> {
  await connectToDatabase();
  const updated = await Quotation.findOneAndUpdate(
    { _id: quotationId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, quotation: updated };
}

/** Called once the source quotation's Invoice/Sales Order has been created — see
 * sales/invoices/actions.ts and sales/sales-orders/actions.ts. Silently no-ops if the quotation
 * is already closed/cancelled/foreign, since the created document is the source of truth once it
 * exists; this is traceability bookkeeping only. */
export async function markQuotationClosed(quotationId: string, businessId: string): Promise<void> {
  await connectToDatabase();
  await Quotation.findOneAndUpdate(
    { _id: quotationId, businessId, status: "open" },
    { $set: { status: "closed" } },
  );
}

export async function softDeleteQuotation(
  quotationId: string,
  businessId: string,
): Promise<QuotationWriteResult> {
  await connectToDatabase();
  const updated = await Quotation.findOneAndUpdate(
    { _id: quotationId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, quotation: updated };
}

export async function restoreQuotation(quotationId: string, businessId: string) {
  await connectToDatabase();
  return Quotation.findOneAndUpdate(
    { _id: quotationId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findQuotationById(quotationId: string, businessId: string) {
  await connectToDatabase();
  return Quotation.findOne({ _id: quotationId, businessId });
}

export type QuotationListParams = {
  search?: string;
  customerId?: string;
  tab?: "all" | "draft" | "open" | "partial" | "closed" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

function buildQuotationFilter(
  businessId: string,
  params: Omit<QuotationListParams, "page" | "pageSize">,
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

export async function listQuotations(businessId: string, params: QuotationListParams = {}) {
  await connectToDatabase();
  const filter = buildQuotationFilter(businessId, params);
  return paginate(Quotation, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { quotationDate: -1, createdAt: -1 },
  });
}

export type QuotationTotalsSummary = { totalMinor: number };

export async function sumQuotationTotals(
  businessId: string,
  params: Omit<QuotationListParams, "page" | "pageSize"> = {},
): Promise<QuotationTotalsSummary> {
  await connectToDatabase();
  const filter = buildQuotationFilter(businessId, params, { forAggregate: true });
  const [agg] = await Quotation.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" } } },
  ]);
  return { totalMinor: agg?.totalMinor ?? 0 };
}
