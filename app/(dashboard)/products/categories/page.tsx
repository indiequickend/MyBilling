import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateCategoryForm } from "./CreateCategoryForm";
import {
  updateProductCategoryAction,
  softDeleteProductCategoryAction,
  restoreProductCategoryAction,
} from "./actions";

export default async function ProductCategoriesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listProductCategories(context.activeBusinessId, "active"),
    listProductCategories(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold">Product categories</h1>
        <CreateCategoryForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.length === 0 ? <TableEmptyState colSpan={2} message="No categories yet." /> : null}
          {active.map((c) => (
            <TableRow key={String(c._id)}>
              <TableCell>
                <form action={updateProductCategoryAction} className="flex items-center gap-2">
                  <input type="hidden" name="categoryId" value={String(c._id)} />
                  <Input name="name" defaultValue={c.name} className="h-8" />
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              </TableCell>
              <TableCell className="text-right">
                <form action={softDeleteProductCategoryAction}>
                  <input type="hidden" name="categoryId" value={String(c._id)} />
                  <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Deleted</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deleted.map((c) => (
                <TableRow key={String(c._id)}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">
                    <form action={restoreProductCategoryAction}>
                      <input type="hidden" name="categoryId" value={String(c._id)} />
                      <Button type="submit" variant="outline" size="sm">
                        Restore
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
