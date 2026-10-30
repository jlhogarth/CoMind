export type IntegrationGatewayConnectionStatus =
  | "ACTIVE"
  | "AUTH_REQUIRED"
  | "SCOPE_REQUIRED"
  | "EXPIRED"
  | "HUMAN_CONFIRMATION_REQUIRED"
  | "BLOCKED";

export interface IntegrationGatewayConnectionSnapshot {
  readonly toolkit: string;
  readonly status: IntegrationGatewayConnectionStatus;
  readonly scope: string;
  readonly authentication: string;
}

export interface IntegrationGatewaySnapshot {
  readonly work_key: "CIG-001";
  readonly provider: "Composio";
  readonly authority: "L4A";
  readonly production_authority: false;
  readonly verification_mode: "verified_snapshot";
  readonly verified_at: string;
  readonly credential_boundary: string;
  readonly connections: readonly IntegrationGatewayConnectionSnapshot[];
}

export const integrationGatewaySnapshot: IntegrationGatewaySnapshot = Object.freeze({
  work_key: "CIG-001",
  provider: "Composio",
  authority: "L4A",
  production_authority: false,
  verification_mode: "verified_snapshot",
  verified_at: "2026-10-30T16:08:00.064Z",
  credential_boundary: "OAuth and provider credentials remain in the integration provider or approved platform session. CoMind retains non-secret governance and provenance metadata only.",
  connections: Object.freeze([
    Object.freeze({ toolkit: "GitHub", status: "ACTIVE", scope: "jlhogarth/CoMind", authentication: "managed connection" }),
    Object.freeze({ toolkit: "Supabase", status: "ACTIVE", scope: "CoMind project", authentication: "managed connection" }),
  ]),
});

export const integrationGatewayProcess = Object.freeze([
  "Resolve the current canonical Development Environment Contract and durable L4A authority.",
  "Confirm the required connection is active and scoped to the intended resource.",
  "Apply applicable RuleBook trust, egress, tenant/project, credential, logging, and human-review controls.",
  "Execute only the least-privilege action required by the authorized objective.",
  "Verify provider state and preserve non-secret provenance, result, failure, and recovery evidence.",
  "Checkpoint authentication or scope interruptions and continue dependency-independent authorized work when safe.",
]);

export const l4aMandatoryStops = Object.freeze([
  "Production activation or consequential Production modification",
  "Irreversible destructive Production operations",
  "Canonical evidence deletion or corruption",
  "Material weakening of security, authentication, audit, or governance",
  "Unauthorized credential or secret changes",
  "New paid subscriptions or material recurring commitments",
  "Material departure from approved architecture or milestone purpose",
  "Consequential legal, contractual, regulatory, or corporate commitments",
  "External publication requiring separate authority",
  "Platform-enforced human confirmation",
]);

const forbiddenEvidenceKeys = new Set([
  "access_token",
  "refresh_token",
  "authorization",
  "password",
  "api_key",
  "client_secret",
  "secret_key",
  "service_role_key",
  "database_url",
  "token",
]);

function containsForbiddenEvidence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenEvidence);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    forbiddenEvidenceKeys.has(key.toLowerCase()) || containsForbiddenEvidence(nested),
  );
}

export function isPublicIntegrationGatewaySnapshotSafe(value: IntegrationGatewaySnapshot): boolean {
  return value.production_authority === false
    && value.verification_mode === "verified_snapshot"
    && !containsForbiddenEvidence(value)
    && value.connections.every((connection) => connection.scope.trim().length > 0);
}
