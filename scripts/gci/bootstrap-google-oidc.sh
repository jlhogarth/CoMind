#!/usr/bin/env bash
# GCI-001: inspect before running in Google Cloud Shell. No JSON keys.
set -euo pipefail
PROJECT_ID=comind-513807
ACCOUNT_UNIQUE_ID=102716239802737631124
POOL_ID=comind-gci
PROVIDER_ID=github-comind
REPO=jlhogarth/CoMind
BRANCH=gci-001-on-demand-gemini-review
WORKFLOW=.github/workflows/gci-001-on-demand-gemini.yml

gcloud config set project "$PROJECT_ID" >&2
ACCOUNTS="$(gcloud iam service-accounts list --project="$PROJECT_ID" --format=json)"
EMAIL="$(jq -r --arg uid "$ACCOUNT_UNIQUE_ID" '.[] | select(.uniqueId == $uid) | .email' <<<"$ACCOUNTS")"
if [[ -z "$EMAIL" ]]; then
 echo "ERROR: service account numeric ID not found; no changes made." >&2; exit 2
fi
echo "Verified identity: $EMAIL"
NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
test -n "$NUMBER"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com drive.googleapis.com docs.googleapis.com --project="$PROJECT_ID"
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
 gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project="$PROJECT_ID" --display-name="CoMind GCI GitHub identity"
fi
CONDITION="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/$BRANCH' && assertion.workflow_ref == '$REPO/$WORKFLOW@refs/heads/$BRANCH'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --location=global --workload-identity-pool="$POOL_ID" --project="$PROJECT_ID" >/dev/null 2>&1; then
 PROVIDER_DATA="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --location=global --workload-identity-pool="$POOL_ID" --project="$PROJECT_ID" --format=json)"
 # Fail closed: never change an existing provider's trust rules automatically.
 if ! jq -e --arg cond "$CONDITION" \
   '(.attributeCondition == $cond) and (.oidc.issuerUri == "https://token.actions.githubusercontent.com") and (.attributeMapping["google.subject"] == "assertion.sub") and (.attributeMapping["attribute.repository"] == "assertion.repository") and (.attributeMapping["attribute.ref"] == "assertion.ref") and (.state == "ACTIVE")' \
   <<<"$PROVIDER_DATA" >/dev/null; then
   echo "ERROR: existing provider differs from approved GCI condition or is not ACTIVE; human security review required." >&2; exit 3
 fi
 echo "Verified existing OIDC provider; proceeding idempotently."
else
 gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location=global --workload-identity-pool="$POOL_ID" --project="$PROJECT_ID" \
  --display-name="CoMind GCI test workflow only" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="$CONDITION"
fi
gcloud iam service-accounts add-iam-policy-binding "$EMAIL" --project="$PROJECT_ID" \
 --role=roles/iam.workloadIdentityUser \
 --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$REPO"
echo "Repository variable GCI_WIF_PROVIDER=projects/$NUMBER/locations/global/workloadIdentityPools/$POOL_ID/providers/$PROVIDER_ID"
echo "Repository variable GCI_SERVICE_ACCOUNT_EMAIL=$EMAIL"
echo "NEXT: Share only the test Google Doc with this email as Editor. Do not share Cloud keys."
