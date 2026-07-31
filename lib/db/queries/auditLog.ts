import { connectToDatabase } from "@/lib/db/connect";
import { AuditLog } from "@/lib/db/models/AuditLog";
import { User } from "@/lib/db/models/User";
import { Membership } from "@/lib/db/models/Membership";
import { clampPageParams, paginate, escapeRegex, type PaginatedResult, type WithId } from "@/lib/db/queryHelpers";
import type { AuditLogDoc } from "@/lib/db/models/AuditLog";

/**
 * Action naming convention: `${entityType}.${verb}` (e.g. "customer.deleted", "role.updated",
 * "payment.voided"). Fixed, non-entity-scoped actions (auth/reveal) use a bare verb-first name.
 * Kept as a plain string rather than a giant union — the entity types this spans (every
 * soft-deletable master/document) already have their own canonical names elsewhere; duplicating
 * them here as a union would just be a second place to keep in sync.
 */
export type RecordAuditLogInput = {
  businessId: string;
  userId: string;
  action: string;
  target: { type: string; id?: string; label?: string };
  before?: unknown;
  after?: unknown;
};

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await connectToDatabase();
  await AuditLog.create({
    businessId: input.businessId,
    userId: input.userId,
    action: input.action,
    target: input.target,
    before: input.before,
    after: input.after,
  });
}

export type AuditLogListFilters = {
  action?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogEntry = WithId<AuditLogDoc> & { userName: string | null };

export async function listAuditLogs(
  businessId: string,
  filters: AuditLogListFilters,
): Promise<PaginatedResult<AuditLogEntry>> {
  await connectToDatabase();
  const filter: Record<string, unknown> = { businessId };
  if (filters.action) filter.action = filters.action;
  if (filters.userId) filter.userId = filters.userId;
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.$gte = filters.from;
    if (filters.to) createdAt.$lte = filters.to;
    filter.createdAt = createdAt;
  }
  if (filters.search) {
    filter["target.label"] = { $regex: escapeRegex(filters.search), $options: "i" };
  }
  const { page, pageSize } = clampPageParams(filters);
  const result = await paginate(AuditLog, filter, { page, pageSize, sort: { createdAt: -1 } });

  const userIds = [...new Set(result.items.map((i) => String(i.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email")
    .lean();
  const nameById = new Map(users.map((u) => [String(u._id), u.name || u.email]));

  return {
    ...result,
    items: result.items.map((i) => ({ ...i, userName: nameById.get(String(i.userId)) ?? null })),
  };
}

/**
 * Logins aren't scoped to one business at the point of auth (a user may belong to several), so a
 * login event is recorded once per business the user is an active member of — each business's
 * Audit Log then shows its own members' login activity.
 */
export async function recordLoginAudit(
  userId: string,
  action: "login.success" | "login.failed",
  label: string,
): Promise<void> {
  await connectToDatabase();
  const memberships = await Membership.find({ userId, status: "active" }).select("businessId").lean();
  await Promise.all(
    memberships.map((m) =>
      AuditLog.create({
        businessId: m.businessId,
        userId,
        action,
        target: { type: "user", id: userId, label },
      }),
    ),
  );
}

/** Distinct action names already logged for this business — powers the filter dropdown. */
export async function listAuditLogActions(businessId: string): Promise<string[]> {
  await connectToDatabase();
  const actions = await AuditLog.distinct("action", { businessId });
  return (actions as string[]).sort();
}
