"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { projectSchema } from "@/lib/validation/projects";
import {
  createProject,
  updateProject,
  softDeleteProject,
  restoreProject,
} from "@/lib/db/queries/projects";

export type ProjectFormState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "projects", "create");

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const project = await createProject({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/projects");
  redirect(`/projects/${String(project._id)}/profit-and-loss`);
}

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "projects", "edit");
  const projectId = String(formData.get("projectId") ?? "");

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updated = await updateProject(projectId, context.activeBusinessId, parsed.data);
  if (!updated) return { error: "Project not found." };
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/profit-and-loss`);
}

export async function softDeleteProjectAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "projects", "delete");
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;
  await softDeleteProject(projectId, context.activeBusinessId);
  revalidatePath("/projects");
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "projects", "delete");
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;
  await restoreProject(projectId, context.activeBusinessId);
  revalidatePath("/projects");
}
