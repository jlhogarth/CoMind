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
printf 'DRB_GOOGLE_VIEWER_READY=true\nDRB_GOOGLE_VIEWER_EMAIL=%s\n' "$email"
