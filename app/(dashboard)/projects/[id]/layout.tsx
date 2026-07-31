import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProjectById } from "@/lib/db/queries/projects";
import { Button } from "@/components/ui/button";

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "projects", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view projects.</p>;
  }

  const project = await findProjectById(id, context.activeBusinessId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          {project.description ? (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
        {can(context.membership, "projects", "edit") ? (
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/edit`}>
              <Pencil data-icon="inline-start" />
              Edit
            </Link>
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
