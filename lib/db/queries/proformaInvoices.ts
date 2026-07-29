import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import {
  ProformaInvoice,
  type ProformaInvoiceLineItemDoc,
  type ProformaInvoiceStatus,
} from "@/lib/db/models/ProformaInvoice";
import { Business } from "@/lib/db/models/Business";
import { Customer } from "@/lib/db/models/Customer";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedSignature } from "@/lib/db/queries/signatures";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type ProformaInvoiceLineItemWriteInput = {
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

export type ProformaInvoiceWriteInput = {
  businessId: string;
  customerId: string;
  proformaDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: ProformaInvoiceLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  customFieldValues?: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
  signatureId?: string;
  bankAccountId?: string;
};

export type CreateProformaInvoiceInput = ProformaInvoiceWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type ProformaInvoiceWriteFailureReason =
  | "customer_not_found"
  | "invalid_signature"
  | "invalid_bank_account"
  | "invalid_note_template"
  | "invalid_term_template"
  | "business_not_found"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type ProformaInvoiceWriteResult =
  | { ok: true; proformaInvoice: InstanceType<typeof ProformaInvoice> }
  | { ok: false; reason: ProformaInvoiceWriteFailureReason };

const EDITABLE_STATUSES: ProformaInvoiceStatus[] = ["draft", "open"];
const CANCELLABLE_STATUSES: ProformaInvoiceStatus[] = ["draft", "open"];
const DELETABLE_STATUSES: ProformaInvoiceStatus[] = ["draft", "cancelled"];

function buildCustomerSnapshot(customer: InstanceType<typeof Customer>) {
  return {
    displayName: customer.displayName,
    gstin: customer.gstin ?? undefined,
    billingAddress: toPlainAddress(customer.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(customer.shippingAddress) ?? undefined,
  };
}

async function assertOwnedProformaInvoiceReferences(params: {
  businessId: string;
  customerId: string;
  signatureId?: string;
  bankAccountId?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; customer: InstanceType<typeof Customer> }
  | { ok: false; reason: ProformaInvoiceWriteFailureReason }
> {
  const customer = await Customer.findOne({
    _id: params.customerId,
    businessId: params.businessId,
    deletedAt: { $exists: false },
  });
  if (!customer) return { ok: false, reason: "customer_not_found" };

  if (params.signatureId && !(await isOwnedSignature(params.signatureId, params.businessId))) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (params.bankAccountId && !(await isOwnedBankAccount(params.bankAccountId, params.businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (params.noteTemplateId && !(await isOwnedNoteTermTemplate(params.noteTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_note_template" };
  }
  if (params.termTemplateId && !(await isOwnedNoteTermTemplate(params.termTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_term_template" };
  }
  return { ok: true, customer };
}

type PreparedProformaInvoiceWrite = {
  ok: true;
  customer: InstanceType<typeof Customer>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: ProformaInvoiceLineItemDoc[];
};

async function prepareProformaInvoiceWrite(
  input: ProformaInvoiceWriteInput,
): Promise<PreparedProformaInvoiceWrite | { ok: false; reason: ProformaInvoiceWriteFailureReason }> {
  const ownership = await assertOwnedProformaInvoiceReferences(input);
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

  const lineItemDocs: ProformaInvoiceLineItemDoc[] = input.lineItems.map((li, i) => ({
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
  })) as ProformaInvoiceLineItemDoc[];

  return { ok: true, customer: ownership.customer, business, totals, lineItemDocs };
}

function buildProformaInvoiceSetFields(
  input: ProformaInvoiceWriteInput,
  prepared: PreparedProformaInvoiceWrite,
) {
  return {
    customerId: prepared.customer._id,
    customerSnapshot: buildCustomerSnapshot(prepared.customer),
    proformaDate: input.proformaDate,
    dueDate: input.dueDate,
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
    signatureId: input.signatureId,
    bankAccountId: input.bankAccountId,
  };
}

export async function createProformaInvoice(
  input: CreateProformaInvoiceInput,
): Promise<ProformaInvoiceWriteResult> {
  await connectToDatabase();

  const prepared = await prepareProformaInvoiceWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: ProformaInvoiceWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "proforma_invoice");
        seriesKey = resolveSeriesKey(input.proformaDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "proforma_invoice", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [proformaDoc] = await ProformaInvoice.create(
        [
          {
            businessId: input.businessId,
            ...buildProformaInvoiceSetFields(input, prepared),
            docNumber,
            seriesKey,
            status: input.finalize ? "open" : "draft",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      result = { ok: true, proformaInvoice: proformaDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Edits a draft/open proforma invoice; cancelled ones are immutable. Not transactional — a
 * single document update, no numbering. */
export async function updateProformaInvoice(
  proformaInvoiceId: string,
  businessId: string,
  input: ProformaInvoiceWriteInput,
): Promise<ProformaInvoiceWriteResult> {
  await connectToDatabase();
  const existing = await ProformaInvoice.findOne({
    _id: proformaInvoiceId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await prepareProformaInvoiceWrite(input);
  if (!prepared.ok) return prepared;

  const updated = await ProformaInvoice.findOneAndUpdate(
    { _id: proformaInvoiceId, businessId },
    { $set: buildProformaInvoiceSetFields(input, prepared) },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, proformaInvoice: updated };
}

class ProformaInvoiceNoLongerDraftError extends Error {}

/** Turns a draft into a numbered, open proforma invoice. */
export async function finalizeProformaInvoiceDraft(
  proformaInvoiceId: string,
  businessId: string,
  input: ProformaInvoiceWriteInput,
): Promise<ProformaInvoiceWriteResult> {
  await connectToDatabase();
  const existing = await ProformaInvoice.findOne({
    _id: proformaInvoiceId,
    businessId,
    deletedAt: { $exists: false },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await prepareProformaInvoiceWrite(input);
  if (!prepared.ok) return prepared;

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: ProformaInvoiceWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "proforma_invoice");
        const seriesKey = resolveSeriesKey(input.proformaDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "proforma_invoice", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await ProformaInvoice.findOneAndUpdate(
          { _id: proformaInvoiceId, businessId, status: "draft" },
          { $set: { ...buildProformaInvoiceSetFields(input, prepared), docNumber, seriesKey, status: "open" } },
          { returnDocument: "after", session },
        );
        if (!updated) throw new ProformaInvoiceNoLongerDraftError();

        result = { ok: true, proformaInvoice: updated };
      });
    } catch (err) {
      if (err instanceof ProformaInvoiceNoLongerDraftError) return { ok: false, reason: "not_editable" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelProformaInvoice(
  proformaInvoiceId: string,
  businessId: string,
): Promise<ProformaInvoiceWriteResult> {
  await connectToDatabase();
  const updated = await ProformaInvoice.findOneAndUpdate(
    { _id: proformaInvoiceId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, proformaInvoice: updated };
}

export async function softDeleteProformaInvoice(
  proformaInvoiceId: string,
  businessId: string,
): Promise<ProformaInvoiceWriteResult> {
  await connectToDatabase();
  const updated = await ProformaInvoice.findOneAndUpdate(
    { _id: proformaInvoiceId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, proformaInvoice: updated };
}

export async function restoreProformaInvoice(proformaInvoiceId: string, businessId: string) {
  await connectToDatabase();
  return ProformaInvoice.findOneAndUpdate(
    { _id: proformaInvoiceId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findProformaInvoiceById(proformaInvoiceId: string, businessId: string) {
  await connectToDatabase();
  return ProformaInvoice.findOne({ _id: proformaInvoiceId, businessId });
}

export type ProformaInvoiceListParams = {
  search?: string;
  customerId?: string;
  tab?: "all" | "draft" | "open" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

function buildProformaInvoiceFilter(
  businessId: string,
  params: Omit<ProformaInvoiceListParams, "page" | "pageSize">,
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

export async function listProformaInvoices(businessId: string, params: ProformaInvoiceListParams = {}) {
  await connectToDatabase();
  const filter = buildProformaInvoiceFilter(businessId, params);
  return paginate(ProformaInvoice, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { proformaDate: -1, createdAt: -1 },
  });
}

export type ProformaInvoiceTotalsSummary = { totalMinor: number };

export async function sumProformaInvoiceTotals(
  businessId: string,
  params: Omit<ProformaInvoiceListParams, "page" | "pageSize"> = {},
): Promise<ProformaInvoiceTotalsSummary> {
  await connectToDatabase();
  const filter = buildProformaInvoiceFilter(businessId, params, { forAggregate: true });
  const [agg] = await ProformaInvoice.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" } } },
  ]);
  return { totalMinor: agg?.totalMinor ?? 0 };
}
