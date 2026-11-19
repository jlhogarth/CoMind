#!/usr/bin/env bash
# DRB-004 dedicated Google-managed Test Viewer. Audit by default; apply only creates the account.
set -euo pipefail
project=comind-513807
number=373198958202
account=comind-drb-runbook-viewer
email="${account}@${project}.iam.gserviceaccount.com"
mode="${1:---audit}"
if [[ $# -gt 1 || ( "$mode" != --audit && "$mode" != --apply && "$mode" != --verify ) ]]; then
  echo 'Usage: drb004-google-viewer.sh [--audit|--apply|--verify]' >&2
  exit 2
fi
for command in gcloud jq; do
  command -v "$command" >/dev/null || { echo "Missing dependency: $command" >&2; exit 4; }
done
actual="$(gcloud projects describe "$project" --format='value(projectNumber)')"
[[ "$actual" == "$number" ]] || { echo 'CoMind project number mismatch' >&2; exit 3; }
state="$(gcloud projects describe "$project" --format='value(lifecycleState)')"
[[ "$state" == ACTIVE ]] || { echo 'CoMind project is not active' >&2; exit 3; }
enabled="$(gcloud services list --enabled --project="$project" --format='value(config.name)')"
grep -Fxq docs.googleapis.com <<<"$enabled" || { echo 'Google Docs API is not enabled' >&2; exit 3; }
if ! gcloud iam service-accounts describe "$email" --project="$project" --format=json >/dev/null 2>&1; then
  if [[ "$mode" != --apply ]]; then echo 'Dedicated account absent'; exit 5; fi
  gcloud iam service-accounts create "$account" --project="$project" --display-name='CoMind RunBook Test Viewer'
fi
data="$(gcloud iam service-accounts describe "$email" --project="$project" --format=json)"
jq -e --arg email "$email" '.email == $email and .disabled != true' <<<"$data" >/dev/null
keys="$(gcloud iam service-accounts keys list --iam-account="$email" --managed-by=user --project="$project" --format=json)"
jq -e 'length == 0' <<<"$keys" >/dev/null || { echo 'Unexpected user-managed key'; exit 3; }
policy="$(gcloud projects get-iam-policy "$project" --format=json)"
jq -e --arg identity "serviceAccount:$email" 'all(.bindings[]?; (.members | index($identity)) == null)' <<<"$policy" >/dev/null || {
  echo 'Unexpected project-level grant to RunBook Viewer'; exit 3;
}
pool=comind-drb-test
provider=github-runbook
resource="projects/$number/locations/global/workloadIdentityPools/$pool"
member="principalSet://iam.googleapis.com/$resource/attribute.repository_id/1028814081"
condition="assertion.repository_id == '1028814081' && assertion.repository_owner_id == '83435038' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'jlhogarth/CoMind/.github/workflows/drb-004-runbook-test.yml@refs/heads/main' && (assertion.event_name == 'schedule' || assertion.event_name == 'workflow_dispatch')"
mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref,attribute.event_name=assertion.event_name"
if ! gcloud iam workload-identity-pools describe "$pool" --location=global --project="$project" --format=json >/dev/null 2>&1; then
  [[ "$mode" == --apply ]] || { echo 'Dedicated workload pool absent'; exit 5; }
  gcloud iam workload-identity-pools create "$pool" --location=global --project="$project" --display-name='CoMind RunBook Test'
fi
pool_data="$(gcloud iam workload-identity-pools describe "$pool" --location=global --project="$project" --format=json)"
jq -e '.state == "ACTIVE" and .disabled != true' <<<"$pool_data" >/dev/null
if ! gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --format=json >/dev/null 2>&1; then
  [[ "$mode" == --apply ]] || { echo 'Dedicated GitHub provider absent'; exit 5; }
  gcloud iam workload-identity-pools providers create-oidc "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" --attribute-condition="$condition"
fi
provider_data="$(gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --format=json)"
jq -e --arg cond "$condition" --arg issuer https://token.actions.githubusercontent.com '.state == "ACTIVE" and .disabled != true and .attributeCondition == $cond and .oidc.issuerUri == $issuer' <<<"$provider_data" >/dev/null || {
  echo 'RunBook provider trust differs from the reviewed condition'; exit 3;
}
account_policy="$(gcloud iam service-accounts get-iam-policy "$email" --project="$project" --format=json)"
if ! jq -e --arg member "$member" 'all(.bindings[]? | select(.role == "roles/iam.workloadIdentityUser" or .role == "roles/iam.serviceAccountTokenCreator"); .role == "roles/iam.workloadIdentityUser" and all(.members[]; . == $member))' <<<"$account_policy" >/dev/null; then
  echo 'Unexpected impersonation grant'; exit 3
fi
if ! jq -e --arg member "$member" 'any(.bindings[]?; .role == "roles/iam.workloadIdentityUser" and (.members | index($member) != null))' <<<"$account_policy" >/dev/null; then
  [[ "$mode" == --apply ]] || { echo 'Scoped impersonation grant absent'; exit 5; }
  gcloud iam service-accounts add-iam-policy-binding "$email" --project="$project" --role=roles/iam.workloadIdentityUser --member="$member" --condition=None >/dev/null
fi
printf 'DRB_GOOGLE_VIEWER_READY=true\nDRB_GOOGLE_VIEWER_EMAIL=%s\n' "$email"
