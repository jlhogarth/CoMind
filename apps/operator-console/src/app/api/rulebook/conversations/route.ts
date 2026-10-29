import { NextRequest, NextResponse } from "next/server";

import {
  listRuleBookConversationStatus,
  parseRuleBookReviewRequest,
  reviewRuleBookConversation,
} from "@/lib/rulebook-operator/service";
import {
  createRuleBookOperatorSupabaseClient,
  getRuleBookOperatorRuntimeConfig,
  RuleBookOperatorUnavailableError,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function unavailable(error: unknown) {
  if (error instanceof RuleBookOperatorUnavailableError) {
    return NextResponse.json(
      { available: false, error: "Protected RuleBook controls are unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

function serverError(error: unknown) {
  console.error("RuleBook operator request failed", {
    name: error instanceof Error ? error.name : typeof error,
  });
  return NextResponse.json(
    { error: "RuleBook operator request failed" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  try {
    const config = getRuleBookOperatorRuntimeConfig();
    const client = createRuleBookOperatorSupabaseClient(config);
    const conversations = await listRuleBookConversationStatus(client, 100);
    return NextResponse.json(
      { available: true, conversations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return unavailable(error) ?? serverError(error);
  }
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const config = getRuleBookOperatorRuntimeConfig();

    if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      return NextResponse.json({ error: "JSON content type required" }, { status: 415 });
    }
    if (request.headers.get("x-comind-operator-intent") !== "rulebook-review") {
      return NextResponse.json({ error: "Explicit RuleBook operator intent required" }, { status: 403 });
    }
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Same-origin RuleBook review required" }, { status: 403 });
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return NextResponse.json({ error: "Cross-site RuleBook review denied" }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseRuleBookReviewRequest(payload);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid RuleBook review request" },
        { status: 400 },
      );
    }

    const client = createRuleBookOperatorSupabaseClient(config);
    const result = await reviewRuleBookConversation(client, config.reviewerId, parsed);
    return NextResponse.json(
      { accepted: true, review: result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return unavailable(error) ?? serverError(error);
  }
}
