# CDK Dev Manual Deploy (Implemented)

This repository now includes executable IaC and deployment scripts:

- CDK app: `infra/`
- Backend image deploy: `scripts/deploy-backend-dev.sh`
- Frontend Amplify deploy trigger: `scripts/deploy-frontend-dev.sh`

## 1) Prepare environment

1. Authenticate AWS CLI credentials for your dev account.
2. Set default region (example):
   - `export AWS_REGION=eu-west-1`
3. Configure required secrets (at least OpenAI key) after first deploy:
   - Secret name created by stack: `<project>-<env>/openai-api-key`
   - Set JSON key `value` to your real API key.

## 2) Bootstrap and deploy infrastructure

From repo root:

1. `npm run infra:bootstrap`
2. `npm run infra:deploy`

Optional context override example:

`npm run infra:deploy -- --context allowedCorsOrigins=https://your-amplify-domain`

## 3) Build and deploy backend container

From repo root:

1. `npm run deploy:backend:dev`

This script:

- reads ECR/ECS outputs from `ShielAssistantDevStack`,
- builds `backend/Dockerfile`,
- pushes image tags (`<sha>` and `latest`),
- forces ECS service rollout.

## 4) Deploy frontend (Amplify)

If Amplify app/branch exists, trigger a release build:

- `npm run deploy:frontend:dev -- <amplify-app-id> [branch-name]`

Example:

- `npm run deploy:frontend:dev -- d3abc123xyz main`

## 5) Required runtime env variables

Use `.env.example` cloud sections and map values to:

- ECS task env/secrets for backend.
- Amplify environment variables for `NEXT_PUBLIC_*`.

## 6) Post-deploy smoke checks

1. `GET /api/health` returns `{ ok: true }`.
2. Anonymous calls to protected `/api/*` endpoints fail with `401` when `AUTH_REQUIRED=true`.
3. Authenticated requests succeed with Cognito bearer token.
4. Task/job/orchestrator state is persisted to DynamoDB.
5. SSE assistant endpoints stream correctly behind ALB.
