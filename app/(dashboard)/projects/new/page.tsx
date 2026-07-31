import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { ProjectForm } from "../ProjectForm";

export default async function NewProjectPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "projects", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create projects.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New project</h1>
      <ProjectForm mode="create" />
    </div>
  );
}
