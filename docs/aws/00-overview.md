# AWS Cloud Migration Overview

This folder contains the implementation artifacts for migrating this project from local-only execution to AWS with:

- Frontend: Amplify Hosting (Next.js)
- Backend: ECS Fargate + ALB (Express API)
- Auth: Cognito User Pool + JWT verification
- State: DynamoDB (+ optional S3)

Read in order:
1. `01-cognito-auth-contract.md`
2. `02-state-storage-design.md`
3. `03-secrets-and-config-plan.md`
4. `04-obsidian-cloud-strategy.md`
5. `05-deployment-runbook.md`
6. `06-cdk-dev-manual-deploy.md`
