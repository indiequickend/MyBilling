import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listBankAccounts, getBankAccountBalance, listBankTransfers } from "@/lib/db/queries/bankAccounts";
import { minorToRupeesString } from "@/lib/utils/money";
import { BANK_ACCOUNT_TYPE_LABELS } from "@/lib/constants/payments";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { setDefaultBankAccountAction, restoreBankAccountAction } from "./actions";
import { DeleteBankAccountButton } from "./DeleteBankAccountButton";
import { TransferFundsForm } from "./TransferFundsForm";

export default async function BanksPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted, transfers] = await Promise.all([
    listBankAccounts(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "deleted"),
    listBankTransfers(context.activeBusinessId, { pageSize: 10 }),
  ]);

  const balances = await Promise.all(
    active.map((a) => getBankAccountBalance(String(a._id), context.activeBusinessId!)),
  );

  return (
    <div className="max-w-4xl space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Banks</h1>
        <Link
          href="/settings/banks/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New account
        </Link>
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th>Type</Th>
          <Th>Balance</Th>
          <Th>Default</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? <TableEmptyState colSpan={5} message="No bank accounts yet." /> : null}
          {active.map((a, i) => (
            <Tr key={String(a._id)}>
              <Td>
                <Link
                  href={`/settings/banks/${String(a._id)}/edit`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {a.name}
                </Link>
              </Td>
              <Td>{BANK_ACCOUNT_TYPE_LABELS[a.type]}</Td>
              <Td>₹{minorToRupeesString(balances[i])}</Td>
              <Td>
                {a.isDefault ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    Default
                  </span>
                ) : (
                  <form action={setDefaultBankAccountAction}>
                    <input type="hidden" name="bankAccountId" value={String(a._id)} />
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
                <DeleteBankAccountButton bankAccountId={String(a._id)} />
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
              {deleted.map((a) => (
                <Tr key={String(a._id)}>
                  <Td>{a.name}</Td>
                  <Td className="text-right">
                    <form action={restoreBankAccountAction}>
                      <input type="hidden" name="bankAccountId" value={String(a._id)} />
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

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Transfer funds</h2>
        <TransferFundsForm accounts={active.map((a) => ({ id: String(a._id), name: a.name }))} />
      </div>

      {transfers.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Recent transfers</h2>
          <Table>
            <Thead>
              <Th>Date</Th>
              <Th>Amount</Th>
              <Th>Note</Th>
            </Thead>
            <Tbody>
              {transfers.items.map((t) => (
                <Tr key={String(t._id)}>
                  <Td>{new Date(t.transferDate).toLocaleDateString()}</Td>
                  <Td>₹{minorToRupeesString(t.amountMinor)}</Td>
                  <Td>{t.note ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
