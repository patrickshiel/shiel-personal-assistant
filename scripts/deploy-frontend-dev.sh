#!/usr/bin/env bash
set -euo pipefail

APP_ID="${1:-}"
BRANCH_NAME="${2:-main}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}"

if [[ -z "${APP_ID}" ]]; then
  echo "Usage: bash ./scripts/deploy-frontend-dev.sh <amplify-app-id> [branch-name]"
  exit 1
fi

echo "Triggering Amplify release job..."
JOB_ID="$(aws amplify start-job \
  --region "${AWS_REGION}" \
  --app-id "${APP_ID}" \
  --branch-name "${BRANCH_NAME}" \
  --job-type RELEASE \
  --query "jobSummary.jobId" \
  --output text)"

echo "Amplify deploy triggered."
echo "App ID: ${APP_ID}"
echo "Branch: ${BRANCH_NAME}"
echo "Job ID: ${JOB_ID}"
