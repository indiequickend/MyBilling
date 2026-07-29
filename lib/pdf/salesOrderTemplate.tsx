import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { minorToRupeesString } from "@/lib/utils/money";
import type { SalesOrderDoc } from "@/lib/db/models/SalesOrder";
import type { AddressSubdoc } from "@/lib/db/models/shared/address";

export type SalesOrderTemplateData = {
  salesOrder: SalesOrderDoc;
  business: {
    name: string;
    brandName?: string;
    gstin?: string;
    addresses?: { billing?: AddressSubdoc | null; shipping?: AddressSubdoc | null };
  };
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
});

/** Renders one Sales Order as a React-PDF Document. Pure-JS layout (no headless browser), so this
 * runs on Vercel serverless functions without a Chromium binary. */
export async function SalesOrderDocument(data: SalesOrderTemplateData) {
  const { salesOrder, business } = data;

  const billingAddress = addressLine(business.addresses?.billing);
  const customerAddress = addressLine(salesOrder.customerSnapshot.billingAddress);

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
            <Text style={styles.bold}>Sales Order {salesOrder.docNumber ?? "(draft)"}</Text>
            <Text style={styles.muted}>Date: {formatDate(salesOrder.orderDate)}</Text>
            {salesOrder.expectedDeliveryDate ? (
              <Text style={styles.muted}>Expected delivery: {formatDate(salesOrder.expectedDeliveryDate)}</Text>
            ) : null}
            {salesOrder.referenceNumber ? (
              <Text style={styles.muted}>Ref: {salesOrder.referenceNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>To</Text>
          <Text>{salesOrder.customerSnapshot.displayName}</Text>
          {salesOrder.customerSnapshot.gstin ? (
            <Text>GSTIN: {salesOrder.customerSnapshot.gstin}</Text>
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
          {salesOrder.lineItems.map((li, idx) => (
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
            <Text>Rs. {minorToRupeesString(salesOrder.subtotalMinor)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax (CGST+SGST/IGST)</Text>
            <Text>Rs. {minorToRupeesString(salesOrder.totalTaxMinor)}</Text>
          </View>
          {salesOrder.discountAmountMinor > 0 ? (
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>-Rs. {minorToRupeesString(salesOrder.discountAmountMinor)}</Text>
            </View>
          ) : null}
          {salesOrder.roundOff && salesOrder.roundOffAmountMinor !== 0 ? (
            <View style={styles.totalsRow}>
              <Text>Round off</Text>
              <Text>Rs. {minorToRupeesString(salesOrder.roundOffAmountMinor)}</Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.bold}>Grand Total</Text>
            <Text style={styles.bold}>Rs. {minorToRupeesString(salesOrder.grandTotalMinor)}</Text>
          </View>
        </View>

        {salesOrder.notes ? (
          <View style={styles.section}>
            <Text style={styles.bold}>Notes</Text>
            <Text>{salesOrder.notes}</Text>
          </View>
        ) : null}
        {salesOrder.terms ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.bold}>Terms</Text>
            <Text>{salesOrder.terms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
