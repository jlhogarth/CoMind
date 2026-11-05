import { NextResponse } from "next/server";
import {
  AedRequestError, AedUnavailableError, authorizeAed, createAedReader, getAedConfig,
  listEvents, listExecutions, parseExecutionId, parsePage, type AedConfig,
} from "./server";
import type { SupabaseClient } from "@supabase/supabase-js";

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleAedGet(request: Request, id?: string, dependencies: {
  config?: () => AedConfig;
  authorize?: typeof authorizeAed;
  reader?: (config: AedConfig) => SupabaseClient;
} = {}) {
  try {
    // Configuration is checked before any credential or database operation.
    const config = (dependencies.config ?? getAedConfig)();
    const auth = await (dependencies.authorize ?? authorizeAed)(request.headers.get("authorization"), config);
    if (auth === "unauthenticated") return json({ error: "Authentication required" }, 401);
    if (auth === "forbidden") return json({ error: "AED operator authorization required" }, 403);
    const parsed = parsePage(new URL(request.url).searchParams);
    if (!id && (parsed.kind || parsed.state)) throw new AedRequestError("Event filters require an execution identifier");
    const reader = (dependencies.reader ?? createAedReader)(config);
    if (id) {
      const result = await listEvents(reader, parseExecutionId(id), parsed.page, parsed.pageSize, parsed.kind, parsed.state);
      return result ? json(result, 200) : json({ error: "Execution not found" }, 404);
    }
    return json(await listExecutions(reader, parsed.page, parsed.pageSize), 200);
  } catch (error) {
    if (error instanceof AedRequestError) return json({ error: error.message }, 400);
    if (error instanceof AedUnavailableError) return json({ error: "AED retrieval unavailable" }, 503);
    console.error("AED retrieval failed", { kind: error instanceof Error ? error.name : "unknown" });
    return json({ error: "AED retrieval unavailable" }, 503);
  }
}
