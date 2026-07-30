import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ExportColumn } from "@/lib/reports/export";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  businessName: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 12, fontWeight: 700, marginTop: 8 },
  muted: { color: "#64748b", marginTop: 2 },
  table: { marginTop: 16, borderWidth: 1, borderColor: "#cbd5e1" },
  tableRow: { flexDirection: "row" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  cell: { flex: 1, padding: 5, borderRightWidth: 1, borderColor: "#cbd5e1" },
  lastCell: { flex: 1, padding: 5 },
  rowBorder: { borderTopWidth: 1, borderColor: "#cbd5e1" },
  headerText: { fontWeight: 700 },
});

export type TabularReportData<T> = {
  title: string;
  businessName: string;
  dateRangeLabel?: string;
  rows: T[];
  columns: ExportColumn<T>[];
};

/**
 * One generic table PDF template reused by every report's PDF export, rather than one template
 * per report — every report is just a title + a set of columns/rows over the same underlying
 * document data (see build_phases.md's Phase 8 description).
 */
export function TabularReportDocument<T>(data: TabularReportData<T>) {
  const { title, businessName, dateRangeLabel, rows, columns } = data;
  const lastIndex = columns.length - 1;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.businessName}>{businessName}</Text>
        <Text style={styles.title}>{title}</Text>
        {dateRangeLabel ? <Text style={styles.muted}>{dateRangeLabel}</Text> : null}

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            {columns.map((c, i) => (
              <View key={c.key} style={i === lastIndex ? styles.lastCell : styles.cell}>
                <Text style={styles.headerText}>{c.header}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.tableRow, styles.rowBorder]}>
              {columns.map((c, i) => (
                <View key={c.key} style={i === lastIndex ? styles.lastCell : styles.cell}>
                  <Text>{String(c.value(row))}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
