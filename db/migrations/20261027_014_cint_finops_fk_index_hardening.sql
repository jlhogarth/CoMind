-- CINT-GOV-001: cover CINT-owned foreign keys used by financial and unit-economics joins.
-- Advisor-driven hardening after bounded Supabase Test deployment.

BEGIN;

CREATE INDEX IF NOT EXISTS cm_agent_operating_policy_profile_idx
    ON comind.cm_agent_operating_policy(profile_id)
    WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_requesting_agent_idx
    ON comind.cm_paid_api_access_proposal(requesting_agent_id)
    WHERE requesting_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_requesting_profile_idx
    ON comind.cm_paid_api_access_proposal(requesting_profile_id)
    WHERE requesting_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_rate_card_idx
    ON comind.cm_paid_api_access_proposal(rate_card_id)
    WHERE rate_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_auth_request_idx
    ON comind.cm_paid_api_access_proposal(authorization_request_id)
    WHERE authorization_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_auth_decision_idx
    ON comind.cm_paid_api_access_proposal(authorization_decision_id)
    WHERE authorization_decision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_paid_api_execution_routing_decision_idx
    ON comind.cm_paid_api_execution(routing_decision_id)
    WHERE routing_decision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_proposal_idx
    ON comind.cm_api_cost_receipt(proposal_id);
CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_foundry_context_idx
    ON comind.cm_api_cost_receipt(foundry_execution_context_id)
    WHERE foundry_execution_context_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_foundry_escalation_context_idx
    ON comind.cm_foundry_escalation_event(execution_context_id)
    WHERE execution_context_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_from_provider_idx
    ON comind.cm_foundry_escalation_event(from_provider_id)
    WHERE from_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_to_provider_idx
    ON comind.cm_foundry_escalation_event(to_provider_id)
    WHERE to_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_auth_request_idx
    ON comind.cm_foundry_escalation_event(authorization_request_id)
    WHERE authorization_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_auth_decision_idx
    ON comind.cm_foundry_escalation_event(authorization_decision_id)
    WHERE authorization_decision_id IS NOT NULL;

COMMIT;
