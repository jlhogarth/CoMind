// Dated, non-secret observations. These records never authorize an action or
// assert that a provider session is still valid at request time.
export type CapabilityProof =
  | "ACTION_VERIFIED"
  | "RESOURCE_READ_VERIFIED"
  | "PROFILE_ONLY"
  | "NOT_VERIFIED"
  | "BLOCKED";

export interface CapabilityObservation {
  readonly id: string;
  readonly service: string;
  readonly account: string;
  readonly action: string;
  readonly proof: CapabilityProof;
  readonly observed_on: string | null;
  readonly evidence: string | null;
  readonly continuation: string;
}

export const capabilityObservations: readonly CapabilityObservation[] = Object.freeze([
  {
    id: "github-founder-dispatch",
    service: "GitHub connected account",
    account: "Joseph / jlhogarth",
    action: "Dispatch the bounded GCI Test workflow through the connected GitHub path",
    proof: "ACTION_VERIFIED",
    observed_on: "2026-11-18",
    evidence: "https://github.com/jlhogarth/CoMind/actions/runs/44423725042",
    continuation: "Recheck the connection and authority at each dispatch; use the existing GCI Test lane.",
  },
  {
    id: "drive-founder-read",
    service: "Google Drive connected account",
    account: "Joseph / Google account",
    action: "Read metadata of the isolated GCI Test document",
    proof: "RESOURCE_READ_VERIFIED",
    observed_on: "2026-11-19",
    evidence: "https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit",
    continuation: "Recheck access before writes; retain the document and session allowlists.",
  },
  ...(["Gmail", "Google Calendar", "Google Contacts"] as const).map((service) => ({
    id: service.toLowerCase().replaceAll(" ", "-") + "-founder-profile",
    service: service + " connected account",
    account: "Joseph / Google account",
    action: "Read the connected account profile",
    proof: "PROFILE_ONLY" as const,
    observed_on: "2026-11-19",
    evidence: null,
    continuation: "Test the exact requested action before depending on it; profile access does not prove write scope.",
  })),
  {
    id: "gci-runner-google",
    service: "GCI Test runner / Google federation",
    account: "gci-001-test service account",
    action: "Read the isolated Doc, invoke Gemini once, write and read back one reply",
    proof: "ACTION_VERIFIED",
    observed_on: "2026-11-18",
    evidence: "https://github.com/jlhogarth/CoMind/actions/runs/44423725042",
    continuation: "Use only the registered Test document and session; inspect a fresh run before claiming current health.",
  },
  {
    id: "google-cloud-founder-admin",
    service: "Google Cloud administration",
    account: "Joseph / Cloud Console",
    action: "Manage IAM, APIs and Workload Identity Federation directly from this agent",
    proof: "NOT_VERIFIED",
    observed_on: "2026-11-19",
    evidence: null,
    continuation: "Use a verified signed-in browser session for the specific operation; evaluate a governed direct adapter separately.",
  },
  {
    id: "gci-private-site-dispatch",
    service: "Private Gemini Bridge Site",
    account: "Owner-private Site runtime",
    action: "Dispatch a GitHub Test workflow from the Site",
    proof: "BLOCKED",
    observed_on: "2026-11-18",
    evidence: "https://github.com/jlhogarth/CoMind/pull/545",
    continuation: "The Site lacks its server-side dispatch credential. Continue GCI through the connected GitHub path; keep Site live dispatch disabled.",
  },
]);

const forbiddenKeys = new Set([
  "access_token", "refresh_token", "authorization", "password", "api_key",
  "client_secret", "secret_key", "service_role_key", "database_url", "token",
]);

function containsForbiddenField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    forbiddenKeys.has(key.toLowerCase()) || containsForbiddenField(nested),
  );
}

export function isSafeCapabilityInventory(value: readonly CapabilityObservation[]): boolean {
  const ids = new Set<string>();
  if (containsForbiddenField(value)) return false;
  return value.every((item) => {
    if (!item.id || ids.has(item.id) || !item.service || !item.action || !item.continuation) return false;
    ids.add(item.id);
    if (item.observed_on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.observed_on)) return false;
    if (item.evidence !== null && !/^https:\/\//.test(item.evidence)) return false;
    if (item.proof === "ACTION_VERIFIED" || item.proof === "RESOURCE_READ_VERIFIED") {
      return item.observed_on !== null && item.evidence !== null;
    }
    return true;
  });
}

export function capabilityPreflight(item: CapabilityObservation): {
  readonly historical_proof: CapabilityProof;
  readonly live_check_required: true;
  readonly can_authorize_action: false;
} {
  return { historical_proof: item.proof, live_check_required: true, can_authorize_action: false };
}
