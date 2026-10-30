import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RuleBookReviewDecision = "approved" | "denied";
export type RuleBookApprovalHours = 1 | 4 | 8 | 24;

export interface RuleBookConversationStatus {
  conversation_id: string;
  asset_key: string;
  classification_key: string;
  classification_rank: number;
  purpose: string;
  tenant_key: string;
  project_scope_key: string;
  destination_key: string;
  human_approved: boolean;
  egress_review_state: "pending" | "approved" | "denied" | "expired";
  egress_reviewed_at: string | null;
  egress_review_expires_at: string | null;
  reviewed_by: string | null;
}

export interface RuleBookReviewRequest {
  conversationId: string;
  decision: RuleBookReviewDecision;
  authorityBasis: string;
  evidenceRef?: string;
  approvalHours?: RuleBookApprovalHours;
}

export interface RuleBookReviewResult {
  review_event_id: string;
  conversation_id: string;
  destination_key: "OPENAI-API";
  project_key: "COMIND";
  decision: RuleBookReviewDecision;
  reviewed_at: string;
  expires_at: string | null;
  request_id: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const approvalHours = new Set<number>([1, 4, 8, 24]);

function plainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("RuleBook review payload must be an object");
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`${label} exceeds ${maximum} characters`);
  }
  return normalized;
}

export function parseRuleBookReviewRequest(value: unknown): RuleBookReviewRequest {
  const input = plainRecord(value);
  const allowedKeys = new Set([
    "conversationId",
    "decision",
    "authorityBasis",
    "evidenceRef",
    "approvalHours",
  ]);
  const unsupported = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported RuleBook review fields: ${unsupported.sort().join(", ")}`);
  }

  const conversationId = boundedText(input.conversationId, "conversationId", 36);
  if (!uuidPattern.test(conversationId)) {
    throw new Error("conversationId must be a UUID");
  }
  if (input.decision !== "approved" && input.decision !== "denied") {
    throw new Error("decision must be approved or denied");
  }

  const authorityBasis = boundedText(input.authorityBasis, "authorityBasis", 2000);
  const evidenceRef = input.evidenceRef == null || input.evidenceRef === ""
    ? undefined
    : boundedText(input.evidenceRef, "evidenceRef", 1000);

  if (input.decision === "approved") {
    if (typeof input.approvalHours !== "number" || !approvalHours.has(input.approvalHours)) {
      throw new Error("approved reviews require approvalHours of 1, 4, 8, or 24");
    }
    return {
      conversationId,
      decision: "approved",
      authorityBasis,
      ...(evidenceRef ? { evidenceRef } : {}),
      approvalHours: input.approvalHours as RuleBookApprovalHours,
    };
  }

  if (input.approvalHours != null) {
    throw new Error("denied reviews cannot include approvalHours");
  }
  return {
    conversationId,
    decision: "denied",
    authorityBasis,
    ...(evidenceRef ? { evidenceRef } : {}),
  };
}

export async function listRuleBookConversationStatus(
  client: SupabaseClient,
  limit = 100,
): Promise<RuleBookConversationStatus[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("RuleBook status limit must be between 1 and 200");
  }
  const { data, error } = await client.rpc("comind_rulebook_operator_conversation_status", {
    p_limit: limit,
  });
  if (error) throw new Error(`RuleBook status query failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("RuleBook status query returned malformed data");
  return data as RuleBookConversationStatus[];
}

export async function reviewRuleBookConversation(
  client: SupabaseClient,
  reviewerId: string,
  request: RuleBookReviewRequest,
): Promise<RuleBookReviewResult> {
  if (!reviewerId.trim()) throw new Error("RuleBook reviewer identity is required");
  const requestId = randomUUID();
  const { data, error } = await client.rpc("comind_rulebook_operator_review_conversation", {
    p_conversation_id: request.conversationId,
    p_decision: request.decision,
    p_reviewed_by: reviewerId.trim(),
    p_authority_basis: request.authorityBasis,
    p_approval_hours: request.decision === "approved" ? request.approvalHours : null,
    p_evidence_ref: request.evidenceRef ?? null,
    p_request_id: requestId,
  });
  if (error) throw new Error(`RuleBook review failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RuleBook review returned malformed data");
  }
  const result = data as unknown as RuleBookReviewResult;
  if (result.request_id !== requestId) {
    throw new Error("RuleBook review returned the wrong request identity");
  }
  return result;
}
