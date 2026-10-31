"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import type { RuleBookConversationStatus } from "@/lib/rulebook-operator/service";

type StatusResponse =
  | { available: true; conversations: RuleBookConversationStatus[] }
  | { available: false; error: string };

type ReviewDecision = "approved" | "denied";

function formatDate(value: string | null) {
  if (!value) return "not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function stateLabel(state: RuleBookConversationStatus["egress_review_state"]) {
  if (state === "approved") return "Approved";
  if (state === "denied") return "Denied";
  if (state === "expired") return "Expired";
  return "Pending review";
}

export function RuleBookConversationGovernancePanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [authorityBasis, setAuthorityBasis] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [approvalHours, setApprovalHours] = useState<1 | 4 | 8 | 24>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastReviewMessage, setLastReviewMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rulebook/conversations", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as StatusResponse | { error?: string };
      if (response.status === 503) {
        setStatus({
          available: false,
          error: "Protected RuleBook controls are unavailable until the trusted operator perimeter is configured.",
        });
        return;
      }
      if (!response.ok || !("available" in payload)) {
        throw new Error("Protected RuleBook status request failed");
      }
      const next = payload as StatusResponse;
      setStatus(next);
      if (next.available && selectedConversationId && !next.conversations.some((row) => row.conversation_id === selectedConversationId)) {
        setSelectedConversationId("");
      }
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : "Protected RuleBook status request failed");
    } finally {
      setIsLoading(false);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const conversations = status?.available ? status.conversations : [];
  const selected = useMemo(
    () => conversations.find((row) => row.conversation_id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const submitReview = async (decision: ReviewDecision) => {
    if (!selected || !authorityBasis.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setLastReviewMessage(null);
    try {
      const response = await fetch("/api/rulebook/conversations", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-comind-operator-intent": "rulebook-review",
        },
        body: JSON.stringify({
          conversationId: selected.conversation_id,
          decision,
          authorityBasis: authorityBasis.trim(),
          ...(evidenceRef.trim() ? { evidenceRef: evidenceRef.trim() } : {}),
          ...(decision === "approved" ? { approvalHours } : {}),
        }),
      });
      const payload = await response.json() as { accepted?: boolean; error?: string };
      if (!response.ok || payload.accepted !== true) {
        throw new Error(payload.error || "RuleBook review was not accepted");
      }
      setLastReviewMessage(decision === "approved" ? "Bounded approval recorded." : "Denial recorded.");
      setAuthorityBasis("");
      setEvidenceRef("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "RuleBook review failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="activity-card" aria-labelledby="conversation-governance-heading">
      <div className="activity-card-main">
        <div className="activity-summary-column" style={{ width: "100%" }}>
          <div className="activity-title-row">
            <h2 id="conversation-governance-heading">Protected conversation governance</h2>
            <button className="hud-refresh" type="button" onClick={() => void load()} disabled={isLoading}>
              <RefreshCw size={14} aria-hidden="true" /> {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <p>
            This protected surface exposes governance status only. Conversation text, prompts, credentials, raw evidence payloads,
            and service credentials are never returned to the browser.
          </p>

          {status && !status.available && (
            <div className="hud-data-note" role="status">
              <LockKeyhole size={16} aria-hidden="true" />
              <span>{status.error}</span>
            </div>
          )}
          {error && <div className="hud-read-error" role="alert">{error}</div>}

          {status?.available && (
            <>
              <div className="hud-data-note" role="status">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{conversations.length} governed conversation{conversations.length === 1 ? "" : "s"} available through the server-only RuleBook operator boundary.</span>
              </div>

              <div className="hud-filters">
                <label>
                  Conversation
                  <select value={selectedConversationId} onChange={(event) => setSelectedConversationId(event.target.value)}>
                    <option value="">Select governed conversation</option>
                    {conversations.map((row) => (
                      <option key={row.conversation_id} value={row.conversation_id}>
                        {row.conversation_id} · {stateLabel(row.egress_review_state)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selected && (
                <div>
                  <p>
                    <b>Classification:</b> {selected.classification_key} ({selected.classification_rank}) · <b>Purpose:</b> {selected.purpose} · <b>Destination:</b> {selected.destination_key}
                  </p>
                  <p>
                    <b>Tenant scope:</b> <code>{selected.tenant_key}</code> · <b>Project scope:</b> <code>{selected.project_scope_key}</code>
                  </p>
                  <p>
                    <b>Egress state:</b> {stateLabel(selected.egress_review_state)} · <b>Reviewed:</b> {formatDate(selected.egress_reviewed_at)} · <b>Expires:</b> {formatDate(selected.egress_review_expires_at)}
                  </p>

                  <div className="hud-filters">
                    <label>
                      Authority basis
                      <input
                        value={authorityBasis}
                        onChange={(event) => setAuthorityBasis(event.target.value)}
                        maxLength={2000}
                        placeholder="Required evidence-backed authority basis"
                      />
                    </label>
                    <label>
                      Evidence reference
                      <input
                        value={evidenceRef}
                        onChange={(event) => setEvidenceRef(event.target.value)}
                        maxLength={1000}
                        placeholder="Optional durable evidence reference"
                      />
                    </label>
                    <label>
                      Approval window
                      <select value={approvalHours} onChange={(event) => setApprovalHours(Number(event.target.value) as 1 | 4 | 8 | 24)}>
                        <option value={1}>1 hour</option>
                        <option value={4}>4 hours</option>
                        <option value={8}>8 hours</option>
                        <option value={24}>24 hours</option>
                      </select>
                    </label>
                  </div>

                  <div className="hud-heading-actions">
                    <button
                      className="hud-refresh"
                      type="button"
                      onClick={() => void submitReview("approved")}
                      disabled={isSubmitting || !authorityBasis.trim()}
                    >
                      <ShieldCheck size={14} aria-hidden="true" /> Approve bounded egress
                    </button>
                    <button
                      className="hud-export"
                      type="button"
                      onClick={() => void submitReview("denied")}
                      disabled={isSubmitting || !authorityBasis.trim()}
                    >
                      <ShieldAlert size={14} aria-hidden="true" /> Deny egress
                    </button>
                  </div>
                  {lastReviewMessage && <div className="hud-data-note" role="status">{lastReviewMessage}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
