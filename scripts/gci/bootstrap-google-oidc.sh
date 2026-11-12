#!/usr/bin/env bash
# Audit by default. Only --apply can enable APIs or change IAM.
set -euo pipefail
PROJECT_ID=comind-513807
ACCOUNT_UNIQUE_ID=102716239802737631124
POOL_ID=comind-gci
PROVIDER_ID=github-comind
REPO=jlhogarth/CoMind
REPO_ID=1028814081
OWNER_ID=83435038
BRANCH=gci-001-on-demand-gemini-review
WORKFLOW=.github/workflows/gci-001-on-demand-gemini.yml
ISSUER=https://token.actions.githubusercontent.com
CONDITION="assertion.repository_id == '$REPO_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/$BRANCH' && assertion.workflow_ref == '$REPO/$WORKFLOW@refs/heads/$BRANCH' && assertion.event_name == 'workflow_dispatch'"
MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id"
MAPPING+=",attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref"
MAPPING+=",attribute.workflow_ref=assertion.workflow_ref,attribute.event_name=assertion.event_name"
REQUIRED_APIS=(iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com drive.googleapis.com docs.googleapis.com)

MODE="${1:---audit}"
if [[ $# -gt 1 || ( "$MODE" != --audit && "$MODE" != --apply ) ]]; then
  echo "Usage: bootstrap-google-oidc.sh [--audit|--apply]" >&2
  exit 2
fi
ACCOUNTS="$(gcloud iam service-accounts list --project="$PROJECT_ID" --format=json)"
EMAIL="$(jq -er --arg uid "$ACCOUNT_UNIQUE_ID" '[.[] | select(.uniqueId == $uid and .disabled != true)] | if length == 1 then .[0].email else error("Expected exactly one enabled service account for the recorded numeric ID") end' <<<"$ACCOUNTS")"
NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ "$NUMBER" =~ ^[0-9]+$ ]]
POOL="projects/$NUMBER/locations/global/workloadIdentityPools/$POOL_ID"
PROVIDER="$POOL/providers/$PROVIDER_ID"
MEMBER="principalSet://iam.googleapis.com/$POOL/attribute.repository_id/$REPO_ID"
printf 'Verified identity: %s\nExpected provider: %s\n' "$EMAIL" "$PROVIDER"

ENABLED="$(gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)')"
MISSING=()
for api in "${REQUIRED_APIS[@]}"; do
  if ! grep -Fxq "$api" <<<"$ENABLED"; then MISSING+=("$api"); fi
done
if (( ${#MISSING[@]} )); then printf 'Required API disabled: %s\n' "${MISSING[@]}"; fi

POOLS="$(gcloud iam workload-identity-pools list --location=global --project="$PROJECT_ID" --format=json)"
POOL_DATA="$(jq -c --arg pool "$POOL" '.[] | select(.name == $pool)' <<<"$POOLS")"
PROVIDER_DATA=
if [[ -n "$POOL_DATA" ]]; then
  jq -e '.state == "ACTIVE" and .disabled != true' <<<"$POOL_DATA" >/dev/null
  PROVIDERS="$(gcloud iam workload-identity-pools providers list --location=global --workload-identity-pool="$POOL_ID" --project="$PROJECT_ID" --format=json)"
  if ! jq -e --arg provider "$PROVIDER" 'all(.[]; .name == $provider)' <<<"$PROVIDERS" >/dev/null; then
    echo "Unexpected provider in the dedicated pool. Stop for IAM review." >&2
    exit 3
  fi
  PROVIDER_DATA="$(jq -c --arg provider "$PROVIDER" '.[] | select(.name == $provider)' <<<"$PROVIDERS")"
fi
if [[ -n "$PROVIDER_DATA" ]]; then
  if ! jq -e --arg cond "$CONDITION" --arg issuer "$ISSUER" --arg mapping "$MAPPING" '
    .attributeCondition == $cond and .oidc.issuerUri == $issuer and
    ((.oidc.allowedAudiences // []) | length == 0) and
    .attributeMapping == ($mapping | split(",") | map(split("=") | {key: .[0], value: .[1]}) | from_entries) and
    .state == "ACTIVE" and .disabled != true
  ' <<<"$PROVIDER_DATA" >/dev/null; then
    echo "Existing provider differs from the approved trust rules. Stop for IAM review." >&2
    exit 3
  fi
  echo "Verified existing OIDC provider."
fi
PROJECT_POLICY="$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json)"
if ! jq -e --arg identity "serviceAccount:$EMAIL" '
  all(.bindings[]?; (.members | index($identity)) == null)
' <<<"$PROJECT_POLICY" >/dev/null; then
  echo "The test service account has a direct project-level role. Stop for IAM review." >&2
  exit 3
fi
USER_KEYS="$(gcloud iam service-accounts keys list --iam-account="$EMAIL" --managed-by=user --project="$PROJECT_ID" --format=json)"
if ! jq -e 'length == 0' <<<"$USER_KEYS" >/dev/null; then
  echo "The test service account has a user-managed key. Stop for IAM review." >&2
  exit 3
fi
POLICY="$(gcloud iam service-accounts get-iam-policy "$EMAIL" --project="$PROJECT_ID" --format=json)"
if ! jq -e --arg member "$MEMBER" '
  all(.bindings[]? | select(.role == "roles/iam.workloadIdentityUser" or .role == "roles/iam.serviceAccountTokenCreator");
    .role == "roles/iam.workloadIdentityUser" and .condition == null and all(.members[]; . == $member))
' <<<"$POLICY" >/dev/null; then
  echo "Unexpected impersonation grant on the service account. Stop for IAM review." >&2
  exit 3
fi
binding_present() {
  jq -e --arg member "$MEMBER" '
    any(.bindings[]?; .role == "roles/iam.workloadIdentityUser" and .condition == null and (.members | index($member) != null))
  ' <<<"$1" >/dev/null
}

if [[ "$MODE" == --audit ]]; then
  [[ -n "$POOL_DATA" ]] || echo "Dedicated pool absent."
  [[ -n "$PROVIDER_DATA" ]] || echo "OIDC provider absent."
  if binding_present "$POLICY"; then echo "Scoped impersonation binding present."; else echo "Scoped impersonation binding absent."; fi
  exit 0
fi

if (( ${#MISSING[@]} )); then gcloud services enable "${MISSING[@]}" --project="$PROJECT_ID"; fi
if [[ -z "$POOL_DATA" ]]; then
  gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project="$PROJECT_ID" --display-name="CoMind GCI GitHub identity"
fi
if [[ -z "$PROVIDER_DATA" ]]; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global --workload-identity-pool="$POOL_ID" --project="$PROJECT_ID" \
    --display-name="CoMind GCI test workflow only" --issuer-uri="$ISSUER" \
    --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION"
fi
if ! binding_present "$POLICY"; then
  gcloud iam service-accounts add-iam-policy-binding "$EMAIL" --project="$PROJECT_ID" \
    --role=roles/iam.workloadIdentityUser --member="$MEMBER" --condition=None >/dev/null
fi
POLICY="$(gcloud iam service-accounts get-iam-policy "$EMAIL" --project="$PROJECT_ID" --format=json)"
binding_present "$POLICY"
printf 'Repository variable GCI_WIF_PROVIDER=%s\nRepository variable GCI_SERVICE_ACCOUNT_EMAIL=%s\n' "$PROVIDER" "$EMAIL"
