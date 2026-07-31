import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { minorToRupeesString } from "@/lib/utils/money";
import type { PaymentDoc } from "@/lib/db/models/Payment";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import type { AddressSubdoc } from "@/lib/db/models/shared/address";

export type PaymentReceiptTemplateData = {
  payment: PaymentDoc;
  business: {
    name: string;
    brandName?: string;
    gstin?: string;
    addresses?: { billing?: AddressSubdoc | null; shipping?: AddressSubdoc | null };
  };
  bankAccount?: { name: string; accountNumber?: string; ifsc?: string } | null;
  partyName?: string;
  linkedDocumentNumber?: string;
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN");
}

function addressLine(addr?: AddressSubdoc | null): string | null {
  if (!addr) return null;
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const LINKED_DOCUMENT_LABELS: Record<string, string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  expense: "Expense",
  indirect_income: "Indirect Income",
};

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
  rowBorder: { borderTopWidth: 1, borderColor: "#cbd5e1" },
  cellLabel: { flex: 1, padding: 8, borderRightWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f1f5f9" },
  cellValue: { flex: 2, padding: 8 },
  amountBlock: { marginTop: 16, alignItems: "flex-end" },
  amountLabel: { color: "#64748b" },
  amountValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
});

/** Renders one Payment as a printable receipt — mirrors purchaseTemplate.tsx's header block, but
 * the body is a label/value table (there are no line items on a payment). */
export async function PaymentReceiptDocument(data: PaymentReceiptTemplateData) {
  const { payment, business, bankAccount, partyName, linkedDocumentNumber } = data;

  const billingAddress = addressLine(business.addresses?.billing);
  const linkedLabel = payment.linkedDocumentType
    ? (LINKED_DOCUMENT_LABELS[payment.linkedDocumentType] ?? payment.linkedDocumentType)
    : "Advance / On account";

  const rows: Array<[string, string]> = [
    ["Direction", payment.direction === "in" ? "Received" : "Paid"],
    ...(partyName
      ? [[payment.direction === "in" ? "Received From" : "Paid To", partyName] as [string, string]]
      : []),
    ["Payment Mode", PAYMENT_MODE_LABELS[payment.mode as keyof typeof PAYMENT_MODE_LABELS]],
    ["Bank/Cash Account", bankAccount?.name ?? "—"],
    ["Against", linkedDocumentNumber ? `${linkedLabel} ${linkedDocumentNumber}` : linkedLabel],
    ...(payment.referenceNote ? [["Reference", payment.referenceNote] as [string, string]] : []),
    ...(payment.voidedAt ? [["Status", "Voided"] as [string, string]] : []),
  ];

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
            <Text style={styles.bold}>Payment Receipt {payment.docNumber ?? ""}</Text>
            <Text style={styles.muted}>Date: {formatDate(payment.paymentDate)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          {rows.map(([label, value], idx) => (
            <View key={label} style={idx > 0 ? [styles.tableRow, styles.rowBorder] : styles.tableRow}>
              <Text style={[styles.cellLabel, styles.bold]}>{label}</Text>
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount</Text>
          <Text style={styles.amountValue}>Rs. {minorToRupeesString(payment.amountMinor)}</Text>
        </View>

        {bankAccount?.accountNumber || bankAccount?.ifsc ? (
          <View style={styles.section}>
            <Text style={styles.bold}>{bankAccount.name}</Text>
            {bankAccount.accountNumber ? <Text style={styles.muted}>A/C: {bankAccount.accountNumber}</Text> : null}
            {bankAccount.ifsc ? <Text style={styles.muted}>IFSC: {bankAccount.ifsc}</Text> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
