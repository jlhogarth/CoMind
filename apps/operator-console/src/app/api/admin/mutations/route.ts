import { NextResponse } from "next/server";

import { isAuthorizedAdminBearer } from "@/lib/admin/auth";
import { getAdminExecutionConfig } from "@/lib/admin/config";
import { validateAdminMutationRequest } from "@/lib/admin/request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let adminToken: string;
  try {
    adminToken = getAdminExecutionConfig().token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Administrative execution unavailable";
    return NextResponse.json(
      { error: "admin_execution_unavailable", message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isAuthorizedAdminBearer(request.headers.get("authorization"), adminToken)) {
    return NextResponse.json(
      { error: "admin_authorization_failed", message: "Administrative authorization failed" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let mutationRequest;
  try {
    mutationRequest = validateAdminMutationRequest(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid administrative mutation request";
    return NextResponse.json(
      { error: "invalid_admin_mutation_request", message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const client = createServerSupabaseClient();
    const { data, error } = await client.rpc("operator_console_apply_mutation", {
      p_request: mutationRequest,
    });

    if (error) {
      return NextResponse.json(
        { error: "admin_mutation_rpc_failed", message: error.message },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = data as Record<string, unknown> | null;
    if (!result || result.success !== true) {
      const denied = result?.errorCode === "42501";
      return NextResponse.json(
        result ?? { success: false, errorCode: "unknown", errorMessage: "Mutation returned no result" },
        { status: denied ? 403 : 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Administrative mutation execution failed";
    return NextResponse.json(
      { error: "admin_mutation_unavailable", message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
