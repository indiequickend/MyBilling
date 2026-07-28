import type { Model, QueryFilter, Types } from "mongoose";

/** Schema-inferred doc types (InferSchemaType) don't include `_id` — lean() results do. */
export type WithId<T> = T & { _id: Types.ObjectId };

/**
 * Escapes regex metacharacters in user-supplied search input before it's used
 * inside a Mongo `$regex` filter. Never string-concatenate raw user input into
 * a query — this is the one place search terms are allowed to reach a filter.
 */
export function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function clampPageParams(params: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));
  return { page, pageSize };
}

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Shared list-query pattern: `.skip()/.limit()` plus a parallel `countDocuments()`.
 * Callers pass an already businessId-scoped filter — this helper never adds
 * scoping of its own, since that responsibility stays in each query function.
 */
export async function paginate<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
  params: { page?: number; pageSize?: number; sort?: Record<string, 1 | -1> },
): Promise<PaginatedResult<WithId<T>>> {
  const { page, pageSize } = clampPageParams(params);
  const [items, total] = await Promise.all([
    model
      .find(filter)
      .sort(params.sort ?? { createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<WithId<T>[]>(),
    model.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
