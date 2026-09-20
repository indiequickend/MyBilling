"use client";

import Link from "next/link";
import { Columns3, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePersistedSelection } from "@/lib/hooks/usePersistedSelection";
import { defaultVisibleColumnIds, type ListColumnDef } from "@/lib/documents/listColumns";

export type DocumentListRow = {
  id: string;
  /** Text for every column except "status". */
  cells: Record<string, string>;
  /** Pre-rendered status stamp (a server-rendered node). */
  status?: ReactNode;
};

/**
 * Shared list table for the six document lists. The server page computes every column's text (a
 * page is small), and this component only decides which columns to show: a per-list choice saved
 * in localStorage so it survives reloads without a server round trip.
 */
export function DocumentListTable({
  docType,
  businessId,
  columns,
  rows,
  footer,
  basePath,
  canEdit,
  emptyMessage,
}: {
  docType: string;
  businessId: string;
  columns: ListColumnDef[];
  rows: DocumentListRow[];
  /** Footer totals keyed by column id; a "Total" label is shown in the first visible column. */
  footer?: Record<string, string>;
  basePath: string;
  canEdit: boolean;
  emptyMessage: string;
}) {
  const defaults = defaultVisibleColumnIds(columns);
  const { selected, update, reset } = usePersistedSelection(
    `mybilling:listCols:${businessId}:${docType}`,
    defaults,
    columns.map((c) => c.id),
  );
  const visible = columns.filter((c) => selected.includes(c.id));
  // Never let the table end up with no columns.
  const shown = visible.length > 0 ? visible : columns.filter((c) => defaults.includes(c.id));

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((v) => v !== id);
    if (next.length === 0) return;
    update(columns.filter((c) => next.includes(c.id)).map((c) => c.id));
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 data-icon="inline-start" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={shown.some((s) => s.id === c.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => toggle(c.id, checked === true)}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                reset();
              }}
            >
              Reset to default
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {shown.map((c) => (
              <TableHead key={c.id}>{c.label}</TableHead>
            ))}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableEmptyState colSpan={shown.length + 1} message={emptyMessage} /> : null}
          {rows.map((row) => (
            <TableRow key={row.id} className="group">
              {shown.map((c) => (
                <TableCell
                  key={c.id}
                  className={
                    c.align === "right"
                      ? "font-tabular tabular-nums"
                      : c.id === "notes" || c.id === "terms"
                        ? "max-w-64 truncate"
                        : undefined
                  }
                >
                  {c.id === "docNumber" ? (
                    <Link href={`${basePath}/${row.id}`} className="font-medium hover:underline">
                      {row.cells.docNumber}
                    </Link>
                  ) : c.id === "status" ? (
                    row.status
                  ) : (
                    row.cells[c.id]
                  )}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${basePath}/${row.id}`}>View</Link>
                  </Button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="More actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem asChild>
                            <Link href={`${basePath}/${row.id}/edit`}>Edit</Link>
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {rows.length > 0 && footer ? (
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              {shown.map((c, i) => (
                <TableCell key={c.id} className={c.align === "right" ? "font-tabular tabular-nums" : undefined}>
                  {i === 0 ? "Total" : (footer[c.id] ?? "")}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
