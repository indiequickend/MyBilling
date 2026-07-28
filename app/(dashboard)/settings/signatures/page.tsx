import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listSignatures } from "@/lib/db/queries/signatures";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { setDefaultSignatureAction, softDeleteSignatureAction, restoreSignatureAction } from "./actions";

export default async function SignaturesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listSignatures(context.activeBusinessId, "active"),
    listSignatures(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Signatures</h1>
        <Link
          href="/settings/signatures/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New signature
        </Link>
      </div>

      <Table>
        <Thead>
          <Th>Preview</Th>
          <Th>Name</Th>
          <Th>Default</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? <TableEmptyState colSpan={4} message="No signatures yet." /> : null}
          {active.map((s) => (
            <Tr key={String(s._id)}>
              <Td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.imageUrl} alt={s.name} className="h-10 w-20 object-contain" />
              </Td>
              <Td>
                <Link
                  href={`/settings/signatures/${String(s._id)}/edit`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {s.name}
                </Link>
              </Td>
              <Td>
                {s.isDefault ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    Default
                  </span>
                ) : (
                  <form action={setDefaultSignatureAction}>
                    <input type="hidden" name="signatureId" value={String(s._id)} />
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
                <form action={softDeleteSignatureAction}>
                  <input type="hidden" name="signatureId" value={String(s._id)} />
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
              <Th>Name</Th>
              <Th />
            </Thead>
            <Tbody>
              {deleted.map((s) => (
                <Tr key={String(s._id)}>
                  <Td>{s.name}</Td>
                  <Td className="text-right">
                    <form action={restoreSignatureAction}>
                      <input type="hidden" name="signatureId" value={String(s._id)} />
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
