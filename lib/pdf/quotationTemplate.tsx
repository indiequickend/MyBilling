import { formatDate } from "@/lib/utils/date";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { minorToRupeesString } from "@/lib/utils/money";
import type { QuotationDoc } from "@/lib/db/models/Quotation";
import type { AddressSubdoc } from "@/lib/db/models/shared/address";

export type QuotationTemplateData = {
  quotation: QuotationDoc;
  business: {
    name: string;
    brandName?: string;
    /** 1st preference for the header identity — falls back to brandName, then name (the legal
     * company name), when absent. */
    logoUrl?: string;
    gstin?: string;
    addresses?: { billing?: AddressSubdoc | null; shipping?: AddressSubdoc | null };
  };
  /** The business's default signature (Quotation has no per-document signature picker of its
   * own, unlike Invoice) — see findDefaultSignature in lib/db/queries/signatures.ts. */
  signature?: { imageUrl: string; name: string } | null;
};

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
    justifyContent: "flex-end",
  },
  signatureImg: { height: 48, objectFit: "contain" },
  logoImg: { height: 40, maxWidth: 180, objectFit: "contain", marginBottom: 4 },
});

/** Renders one Quotation as a React-PDF Document. Pure-JS layout (no headless browser), so this
 * runs on Vercel serverless functions without a Chromium binary. The signature is always the
 * business's default (see QuotationTemplateData's doc-comment), since there's no per-document
 * picker. */
export async function QuotationDocument(data: QuotationTemplateData) {
  const { quotation, business, signature } = data;

  const billingAddress = addressLine(business.addresses?.billing);
  const customerAddress = addressLine(quotation.customerSnapshot.billingAddress);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {business.logoUrl ? (
              <Image style={styles.logoImg} src={business.logoUrl} />
            ) : (
              <Text style={styles.businessName}>{business.brandName || business.name}</Text>
            )}
            {business.gstin ? <Text style={styles.muted}>GSTIN: {business.gstin}</Text> : null}
            {billingAddress ? <Text style={styles.muted}>{billingAddress}</Text> : null}
          </View>
          <View style={styles.alignRight}>
            <Text style={styles.bold}>Quotation {quotation.docNumber ?? "(draft)"}</Text>
            <Text style={styles.muted}>Date: {formatDate(quotation.quotationDate)}</Text>
            {quotation.validUntil ? (
              <Text style={styles.muted}>Valid until: {formatDate(quotation.validUntil)}</Text>
            ) : null}
            {quotation.referenceNumber ? (
              <Text style={styles.muted}>Ref: {quotation.referenceNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>To</Text>
          <Text>{quotation.customerSnapshot.displayName}</Text>
          {quotation.customerSnapshot.gstin ? (
            <Text>GSTIN: {quotation.customerSnapshot.gstin}</Text>
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
          {quotation.lineItems.map((li, idx) => (
            <View key={idx} style={[styles.tableRow, styles.rowBorder]}>
              <View style={styles.cellDescription}>
                <Text>{li.description}</Text>
                {li.notes ? <Text style={[styles.muted, { marginTop: 2, fontSize: 8 }]}>{li.notes}</Text> : null}
              </View>
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
            <Text>Rs. {minorToRupeesString(quotation.subtotalMinor)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax (CGST+SGST/IGST)</Text>
            <Text>Rs. {minorToRupeesString(quotation.totalTaxMinor)}</Text>
          </View>
          {quotation.discountAmountMinor > 0 ? (
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>-Rs. {minorToRupeesString(quotation.discountAmountMinor)}</Text>
            </View>
          ) : null}
          {quotation.roundOff && quotation.roundOffAmountMinor !== 0 ? (
            <View style={styles.totalsRow}>
              <Text>Round off</Text>
              <Text>Rs. {minorToRupeesString(quotation.roundOffAmountMinor)}</Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.bold}>Grand Total</Text>
            <Text style={styles.bold}>Rs. {minorToRupeesString(quotation.grandTotalMinor)}</Text>
          </View>
        </View>

        {signature ? (
          <View style={styles.footer}>
            <View style={styles.alignRight}>
              <Image style={styles.signatureImg} src={signature.imageUrl} />
              <Text style={styles.muted}>Authorized Signatory</Text>
            </View>
          </View>
        ) : null}

        {quotation.notes ? (
          <View style={styles.section}>
            <Text style={styles.bold}>Notes</Text>
            <Text>{quotation.notes}</Text>
          </View>
        ) : null}
        {quotation.terms ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.bold}>Terms</Text>
            <Text>{quotation.terms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
