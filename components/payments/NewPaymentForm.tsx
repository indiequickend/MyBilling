"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PartyPaymentForm } from "@/components/payments/PartyPaymentForm";

type PartyPaymentActionState = { error?: string };
type PartyPaymentAction = (
  state: PartyPaymentActionState,
  formData: FormData,
) => Promise<PartyPaymentActionState>;

function RedirectOutCard({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>
            <Plus data-icon="inline-start" />
            <ButtonLabel>{cta}</ButtonLabel>
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The Payments page's "New Payment" entry point (project_spec.md → Payments) — a single place to
 * quickly record money in/out with no invoice/purchase linking, for any of the four sources: a
 * Customer or Vendor advance/on-account payment (via the same PartyPaymentForm/action pair the
 * party Ledger pages use), or an Expense/Indirect Income — those two are never invoice-linked to
 * begin with, so this just hands off to their existing quick-entry forms rather than duplicating
 * the category/TDS/TCS fields those already have.
 */
export function NewPaymentForm({
  bankAccounts,
  customers,
  vendors,
  recordCustomerPaymentAction,
  recordVendorPaymentAction,
  canCreateExpense,
  canCreateIndirectIncome,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; label: string }>;
  vendors: Array<{ id: string; label: string }>;
  recordCustomerPaymentAction: PartyPaymentAction;
  recordVendorPaymentAction: PartyPaymentAction;
  canCreateExpense: boolean;
  canCreateIndirectIncome: boolean;
}) {
  return (
    <Tabs defaultValue="customer">
      <TabsList>
        <TabsTrigger value="customer">From a customer</TabsTrigger>
        <TabsTrigger value="vendor">To a vendor</TabsTrigger>
        {canCreateExpense ? <TabsTrigger value="expense">Expense</TabsTrigger> : null}
        {canCreateIndirectIncome ? <TabsTrigger value="indirect_income">Indirect income</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="customer" className="mt-4">
        <PartyPaymentForm
          partyType="customer"
          partyIdFieldName="customerId"
          parties={customers}
          bankAccounts={bankAccounts}
          action={recordCustomerPaymentAction}
        />
      </TabsContent>

      <TabsContent value="vendor" className="mt-4">
        <PartyPaymentForm
          partyType="vendor"
          partyIdFieldName="vendorId"
          parties={vendors}
          bankAccounts={bankAccounts}
          action={recordVendorPaymentAction}
        />
      </TabsContent>

      {canCreateExpense ? (
        <TabsContent value="expense" className="mt-4">
          <RedirectOutCard
            title="Record an expense"
            description="Money paid out for a business expense — rent, supplies, utilities, or anything else not billed by a vendor."
            href="/expenses/new"
            cta="New expense"
          />
        </TabsContent>
      ) : null}

      {canCreateIndirectIncome ? (
        <TabsContent value="indirect_income" className="mt-4">
          <RedirectOutCard
            title="Record indirect income"
            description="Money received that isn't from a sales invoice — interest, rent, commission, or any other non-sales income."
            href="/indirect-income/new"
            cta="New indirect income"
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
