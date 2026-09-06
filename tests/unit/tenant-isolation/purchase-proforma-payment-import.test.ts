import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { findOrCreateVendorByName } from "@/lib/db/queries/vendors";
import { findOrCreateCustomerByName } from "@/lib/db/queries/customers";
import { findOrCreateImportBankAccount } from "@/lib/db/queries/bankAccounts";
import { importPurchase } from "@/lib/db/queries/purchases";
import { importPurchaseOrder } from "@/lib/db/queries/purchaseOrders";
import { importProformaInvoice } from "@/lib/db/queries/proformaInvoices";
import { importStandalonePayment } from "@/lib/db/queries/payments";
import { Vendor } from "@/lib/db/models/Vendor";
import { Customer } from "@/lib/db/models/Customer";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Purchase } from "@/lib/db/models/Purchase";
import { PurchaseOrder } from "@/lib/db/models/PurchaseOrder";
import { ProformaInvoice } from "@/lib/db/models/ProformaInvoice";
import { Payment } from "@/lib/db/models/Payment";

describe("purchase/purchase-order/proforma-invoice/payment bulk-import — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("purchase-proforma-payment-import");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      PurchaseOrder.deleteMany({ businessId: { $in: businessIds } }),
      ProformaInvoice.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("findOrCreateVendorByName never resolves to a different business's vendor of the same name", async () => {
    const vendorB = await findOrCreateVendorByName(tenants.businessBId, "Shared Name Vendor");
    const vendorA = await findOrCreateVendorByName(tenants.businessAId, "Shared Name Vendor");
    expect(String(vendorA._id)).not.toBe(String(vendorB._id));

    const vendorAAgain = await findOrCreateVendorByName(tenants.businessAId, "Shared Name Vendor");
    expect(String(vendorAAgain._id)).toBe(String(vendorA._id));
  });

  it("importPurchase scopes the purchase and its payments to the given business, and enforces per-business docNumber uniqueness", async () => {
    const vendorA = await findOrCreateVendorByName(tenants.businessAId, "Purchase Import Vendor");
    const cashA = await findOrCreateImportBankAccount(tenants.businessAId, { mode: "cash" });

    const result = await importPurchase({
      businessId: tenants.businessAId,
      vendorId: String(vendorA._id),
      docNumber: "PUR/TEST/1",
      purchaseDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase",
      subtotalMinor: 9000_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 9000_00,
      payments: [
        { amountMinor: 9000_00, mode: "cash", bankAccountId: String(cashA._id), paymentDate: new Date("2026-06-01") },
      ],
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.purchase.businessId)).toBe(tenants.businessAId);
    expect(result.purchase.status).toBe("paid");
    expect(String(result.payments[0].businessId)).toBe(tenants.businessAId);

    const vendorB = await findOrCreateVendorByName(tenants.businessBId, "Purchase Import Vendor");
    const resultB = await importPurchase({
      businessId: tenants.businessBId,
      vendorId: String(vendorB._id),
      docNumber: "PUR/TEST/1",
      purchaseDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userBId,
    });
    expect(resultB.ok).toBe(true); // same docNumber, different business — fine

    const dup = await importPurchase({
      businessId: tenants.businessAId,
      vendorId: String(vendorA._id),
      docNumber: "PUR/TEST/1",
      purchaseDate: new Date("2026-06-02"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userAId,
    });
    expect(dup).toEqual({ ok: false, reason: "duplicate_doc_number" });
  });

  it("importPurchase rejects a vendor that belongs to a different business", async () => {
    const vendorB = await findOrCreateVendorByName(tenants.businessBId, "Cross Tenant Vendor");
    const result = await importPurchase({
      businessId: tenants.businessAId,
      vendorId: String(vendorB._id),
      docNumber: "PUR/TEST/CROSS",
      purchaseDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userAId,
    });
    expect(result).toEqual({ ok: false, reason: "vendor_not_found" });
  });

  it("importPurchaseOrder scopes the order to the given business and never takes payments", async () => {
    const vendorA = await findOrCreateVendorByName(tenants.businessAId, "PO Import Vendor");
    const result = await importPurchaseOrder({
      businessId: tenants.businessAId,
      vendorId: String(vendorA._id),
      docNumber: "PO/TEST/1",
      orderDate: new Date("2026-08-19"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase order",
      subtotalMinor: 6400_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 6400_00,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.purchaseOrder.businessId)).toBe(tenants.businessAId);
    expect(result.purchaseOrder.status).toBe("open");

    const vendorB = await findOrCreateVendorByName(tenants.businessBId, "PO Import Vendor");
    const resultB = await importPurchaseOrder({
      businessId: tenants.businessBId,
      vendorId: String(vendorB._id),
      docNumber: "PO/TEST/1",
      orderDate: new Date("2026-08-19"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported purchase order",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      createdByUserId: tenants.userBId,
    });
    expect(resultB.ok).toBe(true);
  });

  it("importProformaInvoice scopes the proforma invoice to the given business", async () => {
    const customerA = await findOrCreateCustomerByName(tenants.businessAId, "Proforma Import Customer");
    const result = await importProformaInvoice({
      businessId: tenants.businessAId,
      customerId: String(customerA._id),
      docNumber: "PRE/TEST/1",
      proformaDate: new Date("2026-08-24"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported proforma invoice",
      subtotalMinor: 64000_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 64000_00,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.proformaInvoice.businessId)).toBe(tenants.businessAId);
    expect(result.proformaInvoice.status).toBe("open");
  });

  it("importStandalonePayment scopes the payment to the given business, supports no party, and enforces per-business voucher-number uniqueness", async () => {
    const cashA = await findOrCreateImportBankAccount(tenants.businessAId, { mode: "cash" });

    const noParty = await importStandalonePayment({
      businessId: tenants.businessAId,
      voucherNumber: "PAY/TEST/1",
      direction: "out",
      amountMinor: 2000_00,
      mode: "upi",
      bankAccountId: String(cashA._id),
      paymentDate: new Date("2026-09-06"),
      createdByUserId: tenants.userAId,
    });
    expect(noParty.ok).toBe(true);
    if (noParty.ok) {
      expect(String(noParty.payment.businessId)).toBe(tenants.businessAId);
      expect(noParty.payment.partyId).toBeUndefined();
      expect(noParty.payment.docNumber).toBe("PAY/TEST/1");
    }

    const vendorA = await findOrCreateVendorByName(tenants.businessAId, "Payment Import Vendor");
    const withParty = await importStandalonePayment({
      businessId: tenants.businessAId,
      voucherNumber: "PAY/TEST/2",
      partyType: "vendor",
      partyId: String(vendorA._id),
      direction: "out",
      amountMinor: 1000_00,
      mode: "cash",
      bankAccountId: String(cashA._id),
      paymentDate: new Date("2026-09-06"),
      createdByUserId: tenants.userAId,
    });
    expect(withParty.ok).toBe(true);

    // Same voucher number in a different business is fine — scoped per business.
    const cashB = await findOrCreateImportBankAccount(tenants.businessBId, { mode: "cash" });
    const otherBusiness = await importStandalonePayment({
      businessId: tenants.businessBId,
      voucherNumber: "PAY/TEST/1",
      direction: "out",
      amountMinor: 500_00,
      mode: "cash",
      bankAccountId: String(cashB._id),
      paymentDate: new Date("2026-09-06"),
      createdByUserId: tenants.userBId,
    });
    expect(otherBusiness.ok).toBe(true);

    const dup = await importStandalonePayment({
      businessId: tenants.businessAId,
      voucherNumber: "PAY/TEST/1",
      direction: "out",
      amountMinor: 300_00,
      mode: "cash",
      bankAccountId: String(cashA._id),
      paymentDate: new Date("2026-09-06"),
      createdByUserId: tenants.userAId,
    });
    expect(dup).toEqual({ ok: false, reason: "duplicate_voucher_number" });
  });

  it("importStandalonePayment rejects a party belonging to a different business", async () => {
    const vendorB = await findOrCreateVendorByName(tenants.businessBId, "Cross Tenant Payment Vendor");
    const cashA = await findOrCreateImportBankAccount(tenants.businessAId, { mode: "cash" });

    const result = await importStandalonePayment({
      businessId: tenants.businessAId,
      voucherNumber: "PAY/TEST/CROSS",
      partyType: "vendor",
      partyId: String(vendorB._id),
      direction: "out",
      amountMinor: 100_00,
      mode: "cash",
      bankAccountId: String(cashA._id),
      paymentDate: new Date("2026-09-06"),
      createdByUserId: tenants.userAId,
    });
    expect(result).toEqual({ ok: false, reason: "party_not_found" });
  });
});
