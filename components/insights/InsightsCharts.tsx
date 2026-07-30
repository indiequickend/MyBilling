"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { minorToRupeesString } from "@/lib/utils/money";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };
const legendStyle = { fontSize: 12, color: "var(--muted-foreground)" };

function formatRupees(minor: number): string {
  return `₹${minorToRupeesString(minor)}`;
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type TrendPoint = { periodStart: string; totalMinor: number };

/** Single-hue line + a recessive dashed average reference line, per the dataviz skill's guidance
 * for a "sales-trend chart with an average line" (project_spec.md's Insights spec). */
export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  const average = data.length ? data.reduce((sum, d) => sum + d.totalMinor, 0) / data.length : 0;

  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No sales in this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="periodStart"
          tick={axisTick}
          tickFormatter={formatShortDate}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis tick={axisTick} tickFormatter={formatRupees} axisLine={false} tickLine={false} width={70} />
        <Tooltip
          formatter={(value) => formatRupees(Number(value))}
          labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
          contentStyle={tooltipStyle}
        />
        <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="totalMinor"
          name="Sales"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Bar form for magnitude-by-discrete-period, per the dataviz skill's form heuristic. */
export function WeeklyRevenueChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No revenue in this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="periodStart"
          tick={axisTick}
          tickFormatter={formatShortDate}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis tick={axisTick} tickFormatter={formatRupees} axisLine={false} tickLine={false} width={70} />
        <Tooltip
          formatter={(value) => formatRupees(Number(value))}
          labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
          contentStyle={tooltipStyle}
        />
        <Bar dataKey="totalMinor" name="Revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type PaymentsByBankRow = { bankAccountName: string; receivedMinor: number; givenMinor: number };

/** Grouped bars — identity (account) x polarity (in/out) — the two fixed-order categorical hues
 * (blue=received, orange=given), validated via the dataviz skill's palette validator. */
export function PaymentsByBankChart({ data }: { data: PaymentsByBankRow[] }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No payments in this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="bankAccountName"
          tick={axisTick}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis tick={axisTick} tickFormatter={formatRupees} axisLine={false} tickLine={false} width={70} />
        <Tooltip formatter={(value) => formatRupees(Number(value))} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={legendStyle} />
        <Bar dataKey="receivedMinor" name="Received" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="givenMinor" name="Given" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
