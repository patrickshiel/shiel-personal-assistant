#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-ShielAssistantDevStack}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Reading CloudFormation outputs from ${STACK_NAME} (${AWS_REGION})..."
ECR_REPO_URI="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='BackendEcrRepositoryUri'].OutputValue" \
  --output text)"

ECS_CLUSTER_NAME="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='EcsClusterName'].OutputValue" \
  --output text)"

ECS_SERVICE_NAME="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='EcsServiceName'].OutputValue" \
  --output text)"

if [[ -z "${ECR_REPO_URI}" || "${ECR_REPO_URI}" == "None" ]]; then
  echo "BackendEcrRepositoryUri output was not found."
  exit 1
fi

if [[ -z "${ECS_CLUSTER_NAME}" || "${ECS_CLUSTER_NAME}" == "None" ]]; then
  echo "EcsClusterName output was not found."
  exit 1
fi

if [[ -z "${ECS_SERVICE_NAME}" || "${ECS_SERVICE_NAME}" == "None" ]]; then
  echo "EcsServiceName output was not found."
  exit 1
fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

IMAGE_TAG="${2:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"
IMAGE_URI="${ECR_REPO_URI}:${IMAGE_TAG}"

echo "Building backend image: ${IMAGE_URI}"
docker build -t "${IMAGE_URI}" "${ROOT_DIR}/backend"

echo "Pushing backend image..."
docker push "${IMAGE_URI}"

echo "Also tagging :latest for ECS default task image..."
docker tag "${IMAGE_URI}" "${ECR_REPO_URI}:latest"
docker push "${ECR_REPO_URI}:latest"

echo "Forcing ECS service deployment..."
aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER_NAME}" \
  --service "${ECS_SERVICE_NAME}" \
  --force-new-deployment >/dev/null

echo "Backend deployment triggered."
echo "Cluster: ${ECS_CLUSTER_NAME}"
echo "Service: ${ECS_SERVICE_NAME}"
echo "Image: ${IMAGE_URI}"
