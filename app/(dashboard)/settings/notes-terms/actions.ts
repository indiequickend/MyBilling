"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { noteTermTemplateSchema } from "@/lib/validation/noteTermTemplates";
import { parseCheckbox } from "@/lib/validation/shared";
import {
  createNoteTermTemplate,
  updateNoteTermTemplate,
  setDefaultNoteTermTemplate,
  softDeleteNoteTermTemplate,
  restoreNoteTermTemplate,
} from "@/lib/db/queries/noteTermTemplates";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type NoteTermFormState = { error?: string; fieldErrors?: Record<string, string> };

async function requireDocumentSettingsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_document_settings");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

function parseForm(formData: FormData) {
  return noteTermTemplateSchema.safeParse({
    docType: formData.get("docType"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    body: formData.get("body"),
    isActive: parseCheckbox(formData, "isActive"),
  });
}

export async function createNoteTermTemplateAction(
  _prev: NoteTermFormState,
  formData: FormData,
): Promise<NoteTermFormState> {
  const context = await requireDocumentSettingsPermission();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await createNoteTermTemplate({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/settings/notes-terms");
  redirect("/settings/notes-terms");
}

export async function updateNoteTermTemplateAction(
  _prev: NoteTermFormState,
  formData: FormData,
): Promise<NoteTermFormState> {
  const context = await requireDocumentSettingsPermission();
  const templateId = String(formData.get("templateId") ?? "");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await updateNoteTermTemplate(templateId, context.activeBusinessId, {
    title: parsed.data.title,
    body: parsed.data.body,
    isActive: parsed.data.isActive,
  });
  revalidatePath("/settings/notes-terms");
  redirect("/settings/notes-terms");
}

export async function setDefaultNoteTermTemplateAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;
  await setDefaultNoteTermTemplate(templateId, context.activeBusinessId);
  revalidatePath("/settings/notes-terms");
}

export async function softDeleteNoteTermTemplateAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;
  const template = await softDeleteNoteTermTemplate(templateId, context.activeBusinessId);
  if (template) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "note_term_template.deleted",
      target: { type: "note_term_template", id: templateId, label: template.title ?? undefined },
    });
  }
  revalidatePath("/settings/notes-terms");
}

export async function restoreNoteTermTemplateAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;
  const template = await restoreNoteTermTemplate(templateId, context.activeBusinessId);
  if (template) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "note_term_template.restored",
      target: { type: "note_term_template", id: templateId, label: template.title ?? undefined },
    });
  }
  revalidatePath("/settings/notes-terms");
}
