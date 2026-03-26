# Deployment Runbook (Amplify + ECS + Cognito)

## 0) Prerequisites
- AWS account + DNS domain
- ACM certificates for frontend and backend domains
- GitHub repo connected to Amplify and CI pipeline
- CDK bootstrap completed in target account/region

## 0.1) IaC command baseline (this repo)
- `npm run infra:bootstrap`
- `npm run infra:diff`
- `npm run infra:deploy`
- `npm run deploy:backend:dev`
- `npm run deploy:frontend:dev -- <amplify-app-id> [branch]`

## 1) Cognito setup
1. Create User Pool
2. Create App Client (no secret for SPA frontend)
3. Configure Hosted UI domain
4. Configure callback/logout URLs for Amplify domain
5. Record:
   - UserPoolId
   - AppClientId
   - Cognito domain
   - Region

## 2) Backend on ECS Fargate
1. Build backend image (Node 20)
2. Push to ECR
3. Create ECS cluster/service
4. Attach ALB target group to backend container port
5. Configure health check path: `/api/health`
6. Set task env + secrets (Secrets Manager/SSM)
7. Set ALB idle timeout >= SSE needs (recommend 120s+ to start, tune)
8. Restrict CORS to Amplify domain

## 3) Frontend on Amplify
1. Connect repo and choose Next.js build profile
2. Set frontend env vars:
   - `NEXT_PUBLIC_BACKEND_URL=https://<backend-domain>`
   - Cognito public config values
3. Deploy branch and verify SSR/API routes

## 4) DNS and TLS
- Frontend domain -> Amplify
- Backend domain -> ALB
- Ensure HTTPS only and HSTS where applicable

## 5) Validation checklist
- Auth login/logout works
- Protected backend routes reject anonymous requests
- Chat streaming endpoints function through ALB
- Task/calendar CRUD works with external APIs
- TTS/STT endpoints functional
- CloudWatch logs visible and searchable

## 6) Observability and rollback
- CloudWatch alarms:
  - 5xx rate
  - target response time
  - ECS task restarts
- Rollback:
  - keep prior ECS task definition revision
  - keep prior Amplify release
  - rollback both if contract change spans frontend/backend

## 7) Cutover sequence
1. Deploy backend (auth off, internal test)
2. Deploy frontend against cloud backend
3. Enable auth in backend
4. Final smoke test
5. Switch DNS to production
