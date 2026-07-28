import { z } from "zod";
import { isValidModule, isValidAction } from "@/lib/rbac/permissions";
import { ROLE_TEMPLATES } from "@/lib/rbac/templates";

const permissionMatrixSchema = z
  .record(z.string(), z.record(z.string(), z.boolean()))
  .superRefine((matrix, ctx) => {
    for (const [moduleKey, actions] of Object.entries(matrix)) {
      if (!isValidModule(moduleKey)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown module: ${moduleKey}`,
          path: [moduleKey],
        });
        continue;
      }
      for (const actionKey of Object.keys(actions)) {
        if (!isValidAction(moduleKey, actionKey)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown action: ${moduleKey}.${actionKey}`,
            path: [moduleKey, actionKey],
          });
        }
      }
    }
  });

const templateNames = Object.keys(ROLE_TEMPLATES) as [string, ...string[]];

export const createRoleFromTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  template: z.enum(templateNames),
});
export type CreateRoleFromTemplateInput = z.infer<typeof createRoleFromTemplateSchema>;

export const createRoleFromScratchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: permissionMatrixSchema,
});
export type CreateRoleFromScratchInput = z.infer<typeof createRoleFromScratchSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  permissions: permissionMatrixSchema.optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
