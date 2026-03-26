# AWS CDK Infra (dev)

This workspace provisions the dev environment for:

- VPC + ECS Fargate + ALB
- ECR repository for backend images
- Cognito User Pool + App Client
- DynamoDB tables for jobs/orchestrator/memory
- S3 bucket for artifacts
- Optional Amplify app + branch

## Commands

From repo root:

- `npm run infra:bootstrap`
- `npm run infra:diff`
- `npm run infra:deploy`
- `npm run infra:destroy`

## Context values

Default context is in `infra/cdk.json`.

- `projectName`
- `environmentName`
- `allowedCorsOrigins`
- `enableAmplify`
- `amplifyRepository`
- `amplifyOauthTokenSecretArn`
- `amplifyBranchName`

Override with:

`npm run infra:deploy -- --context key=value`
