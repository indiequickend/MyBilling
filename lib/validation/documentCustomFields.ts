import { customFieldDefsSchema } from "@/lib/validation/shared";

/**
 * Per-document-type custom header field defs (Business.documentCustomFieldDefs) reuse the exact
 * shape defined for Business's own company-detail custom fields — see shared.ts:93-96. This
 * wrapper exists only so callers importing "document custom fields" don't have to know that
 * detail; the schema itself needs no changes.
 */
export const documentCustomFieldDefsSchema = customFieldDefsSchema;
