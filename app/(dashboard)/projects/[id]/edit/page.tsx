import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProjectById } from "@/lib/db/queries/projects";
import { ProjectForm } from "../../ProjectForm";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "projects", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit projects.</p>;
  }

  const project = await findProjectById(id, context.activeBusinessId);
  if (!project) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit project</h1>
      <ProjectForm
        mode="edit"
        projectId={id}
        defaultValues={{ name: project.name, description: project.description ?? "" }}
      />
    </div>
  );
}
