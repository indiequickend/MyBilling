import QRCode from "qrcode";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { minorToRupeesString } from "@/lib/utils/money";
import type { InvoiceDoc } from "@/lib/db/models/Invoice";
import type { AddressSubdoc } from "@/lib/db/models/shared/address";

export type InvoiceTemplateData = {
  invoice: InvoiceDoc;
  business: {
    name: string;
    brandName?: string;
    gstin?: string;
    addresses?: { billing?: AddressSubdoc | null; shipping?: AddressSubdoc | null };
  };
  bankAccount?: { name: string; accountNumber?: string; ifsc?: string; upiId?: string } | null;
  signature?: { imageUrl: string; name: string } | null;
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN");
}

function addressLine(addr?: AddressSubdoc | null): string | null {
  if (!addr) return null;
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  businessName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  muted: { color: "#64748b" },
  alignRight: { alignItems: "flex-end" },
  section: { marginTop: 16 },
  bold: { fontWeight: 700 },
  table: { marginTop: 16, borderWidth: 1, borderColor: "#cbd5e1" },
  tableRow: { flexDirection: "row" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  cellDescription: { flex: 3, padding: 6, borderRightWidth: 1, borderColor: "#cbd5e1" },
  cellHsn: { flex: 1.2, padding: 6, borderRightWidth: 1, borderColor: "#cbd5e1" },
  cellQty: { flex: 1, padding: 6, borderRightWidth: 1, borderColor: "#cbd5e1" },
  cellPrice: { flex: 1.3, padding: 6, borderRightWidth: 1, borderColor: "#cbd5e1" },
  cellTax: { flex: 0.8, padding: 6, borderRightWidth: 1, borderColor: "#cbd5e1" },
  cellTotal: { flex: 1.3, padding: 6 },
  rowBorder: { borderTopWidth: 1, borderColor: "#cbd5e1" },
  totals: { marginTop: 12, width: 220, marginLeft: "auto" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#0f172a",
    marginTop: 4,
    paddingTop: 4,
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  signatureImg: { height: 48, objectFit: "contain" },
  qrImg: { height: 90, width: 90 },
});

/**
 * Renders one Invoice as a React-PDF Document. Pure-JS layout (no headless browser), so this
 * runs on Vercel serverless functions without a Chromium binary. Thermal (58/80mm) receipts get
 * their own template in Phase 10 — this is the A4 print/PDF shape only.
 */
export async function InvoiceDocument(data: InvoiceTemplateData) {
  const { invoice, business, bankAccount, signature } = data;

  let qrDataUri: string | null = null;
  if (bankAccount?.upiId) {
    const upiUrl = `upi://pay?pa=${encodeURIComponent(bankAccount.upiId)}&pn=${encodeURIComponent(
      business.brandName || business.name,
    )}&am=${(invoice.grandTotalMinor / 100).toFixed(2)}&cu=INR`;
    qrDataUri = await QRCode.toDataURL(upiUrl, { margin: 1, width: 240 });
  }

  const billingAddress = addressLine(business.addresses?.billing);
  const customerAddress = addressLine(invoice.customerSnapshot.billingAddress);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{business.brandName || business.name}</Text>
            {business.gstin ? <Text style={styles.muted}>GSTIN: {business.gstin}</Text> : null}
            {billingAddress ? <Text style={styles.muted}>{billingAddress}</Text> : null}
          </View>
          <View style={styles.alignRight}>
            <Text style={styles.bold}>Invoice {invoice.docNumber ?? "(draft)"}</Text>
            <Text style={styles.muted}>Date: {formatDate(invoice.invoiceDate)}</Text>
            {invoice.dueDate ? <Text style={styles.muted}>Due: {formatDate(invoice.dueDate)}</Text> : null}
            {invoice.referenceNumber ? (
              <Text style={styles.muted}>Ref: {invoice.referenceNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>Bill to</Text>
          <Text>{invoice.customerSnapshot.displayName}</Text>
          {invoice.customerSnapshot.gstin ? (
            <Text>GSTIN: {invoice.customerSnapshot.gstin}</Text>
          ) : null}
          {customerAddress ? <Text style={styles.muted}>{customerAddress}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellDescription, styles.bold]}>Description</Text>
            <Text style={[styles.cellHsn, styles.bold]}>HSN/SAC</Text>
            <Text style={[styles.cellQty, styles.bold]}>Qty</Text>
            <Text style={[styles.cellPrice, styles.bold]}>Unit Price</Text>
            <Text style={[styles.cellTax, styles.bold]}>Tax</Text>
            <Text style={[styles.cellTotal, styles.bold]}>Total</Text>
          </View>
          {invoice.lineItems.map((li, idx) => (
            <View key={idx} style={[styles.tableRow, styles.rowBorder]}>
              <Text style={styles.cellDescription}>{li.description}</Text>
              <Text style={styles.cellHsn}>{li.hsnOrSac ?? ""}</Text>
              <Text style={styles.cellQty}>
                {li.quantity} {li.unit ?? ""}
              </Text>
              <Text style={styles.cellPrice}>Rs. {minorToRupeesString(li.unitPriceMinor)}</Text>
              <Text style={styles.cellTax}>{li.taxRatePercent}%</Text>
              <Text style={styles.cellTotal}>Rs. {minorToRupeesString(li.totalMinor)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>Rs. {minorToRupeesString(invoice.subtotalMinor)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax (CGST+SGST/IGST)</Text>
            <Text>Rs. {minorToRupeesString(invoice.totalTaxMinor)}</Text>
          </View>
          {invoice.discountAmountMinor > 0 ? (
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>-Rs. {minorToRupeesString(invoice.discountAmountMinor)}</Text>
            </View>
          ) : null}
          {invoice.roundOff && invoice.roundOffAmountMinor !== 0 ? (
            <View style={styles.totalsRow}>
              <Text>Round off</Text>
              <Text>Rs. {minorToRupeesString(invoice.roundOffAmountMinor)}</Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.bold}>Grand Total</Text>
            <Text style={styles.bold}>Rs. {minorToRupeesString(invoice.grandTotalMinor)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Paid</Text>
            <Text>Rs. {minorToRupeesString(invoice.amountPaidMinor)}</Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.section}>
            <Text style={styles.bold}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}
        {invoice.terms ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.bold}>Terms</Text>
            <Text>{invoice.terms}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View>
            {bankAccount ? (
              <>
                <Text style={styles.bold}>{bankAccount.name}</Text>
                {bankAccount.accountNumber ? (
                  <Text style={styles.muted}>A/C: {bankAccount.accountNumber}</Text>
                ) : null}
                {bankAccount.ifsc ? <Text style={styles.muted}>IFSC: {bankAccount.ifsc}</Text> : null}
              </>
            ) : null}
            {qrDataUri ? <Image style={styles.qrImg} src={qrDataUri} /> : null}
          </View>
          {signature ? (
            <View style={styles.alignRight}>
              <Image style={styles.signatureImg} src={signature.imageUrl} />
              <Text style={styles.muted}>Authorized Signatory</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
