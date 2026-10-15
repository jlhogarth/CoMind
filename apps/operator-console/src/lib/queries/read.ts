import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PAGE_SIZE = 100;

export interface ReadPageRequest {
  relation: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export interface ReadPageResult {
  rows: Record<string, unknown>[];
  count: number | null;
  page: number;
  pageSize: number;
}

function assertIdentifier(identifier: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid ${label}: ${identifier}`);
  }
}

export async function readRelationPage(
  client: SupabaseClient,
  request: ReadPageRequest,
): Promise<ReadPageResult> {
  assertIdentifier(request.relation, "relation name");
  if (request.orderBy) assertIdentifier(request.orderBy, "order column");

  const page = Math.max(1, Math.trunc(request.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(request.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client.from(request.relation).select("*", { count: "exact" }).range(from, to);
  if (request.orderBy) {
    query = query.order(request.orderBy, { ascending: request.ascending ?? true });
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Unable to read ${request.relation}: ${error.message}`);
  }

  return {
    rows: (data ?? []) as Record<string, unknown>[],
    count,
    page,
    pageSize,
  };
}
