import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import {
  setDefaultNoteTermTemplateAction,
  softDeleteNoteTermTemplateAction,
  restoreNoteTermTemplateAction,
} from "./actions";

export default async function NotesTermsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listNoteTermTemplates(context.activeBusinessId, { tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { tab: "deleted" }),
  ]);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Notes &amp; Terms</h1>
        <Link
          href="/settings/notes-terms/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New template
        </Link>
      </div>

      <Table>
        <Thead>
          <Th>Document</Th>
          <Th>Kind</Th>
          <Th>Title</Th>
          <Th>Active</Th>
          <Th>Default</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? <TableEmptyState colSpan={6} message="No templates yet." /> : null}
          {active.map((t) => (
            <Tr key={String(t._id)}>
              <Td>{DOCUMENT_TYPE_LABELS[t.docType]}</Td>
              <Td className="capitalize">{t.kind}</Td>
              <Td>
                <Link
                  href={`/settings/notes-terms/${String(t._id)}/edit`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {t.title || "(untitled)"}
                </Link>
              </Td>
              <Td>{t.isActive ? "Yes" : "No"}</Td>
              <Td>
                {t.isDefault ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    Default
                  </span>
                ) : (
                  <form action={setDefaultNoteTermTemplateAction}>
                    <input type="hidden" name="templateId" value={String(t._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Set default
                    </button>
                  </form>
                )}
              </Td>
              <Td className="text-right">
                <form action={softDeleteNoteTermTemplateAction}>
                  <input type="hidden" name="templateId" value={String(t._id)} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Deleted</h2>
          <Table>
            <Thead>
              <Th>Title</Th>
              <Th />
            </Thead>
            <Tbody>
              {deleted.map((t) => (
                <Tr key={String(t._id)}>
                  <Td>{t.title || "(untitled)"}</Td>
                  <Td className="text-right">
                    <form action={restoreNoteTermTemplateAction}>
                      <input type="hidden" name="templateId" value={String(t._id)} />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Restore
                      </button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
