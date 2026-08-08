import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { switchBusinessAction } from "@/app/(dashboard)/businesses/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function BusinessesSettingsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_company")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Businesses"
        actions={
          <Button asChild aria-label="Add another business">
            <Link href="/businesses/new">
              <Plus data-icon="inline-start" />
              <ButtonLabel>Add another business</ButtonLabel>
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="divide-y p-0">
          {context.businesses.map((b) => {
            const id = String(b._id);
            const isActive = id === context.activeBusinessId;
            return (
              <div key={id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  {isActive ? <Badge variant="success">Active</Badge> : null}
                </div>
                <div className="flex items-center gap-2">
                  {!isActive ? (
                    <form action={switchBusinessAction}>
                      <input type="hidden" name="businessId" value={id} />
                      <Button type="submit" variant="outline" size="sm">
                        Switch
                      </Button>
                    </form>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/settings/company">Edit details</Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
