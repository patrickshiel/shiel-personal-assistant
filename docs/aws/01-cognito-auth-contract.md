# Cognito Auth Contract

## Objective
Introduce Cognito authentication without breaking current frontend/backend API contracts, while keeping single-user rollout simple.

## Frontend contract

### Required behavior
- User must be authenticated before loading app shell.
- Frontend acquires Cognito access token (or ID token) after login.
- All backend-bound requests include:
  - `Authorization: Bearer <jwt>`

### Integration points in current code
- Main app shell and request calls are in `frontend/app/page.tsx`.
- API proxy routes are in `frontend/app/api/**` and should validate session before forwarding where applicable.

### Session lifecycle
- Login via Cognito Hosted UI.
- Store session in secure cookie (preferred) or memory-backed client session via Amplify auth SDK.
- Refresh token handled by Cognito SDK, not custom code.

## Backend contract

### Required behavior
- Protect all write/assistant/task/calendar endpoints except:
  - `/api/health`
- Verify JWT signature and claims against Cognito JWKs.
- Enforce issuer/audience/client-id checks.

### Required claims
- `sub` (user id)
- `iss`
- `aud` or `client_id`
- optional groups for future RBAC

### User propagation
After middleware verification, populate request context:
- `req.auth.userId = <sub>`
- `req.auth.email = <email if present>`

This enables per-user partition keys in storage.

## Endpoint protection scope (phase 1)
Protect all routes in `backend/src/server.ts` except:
- `GET /api/health`

## Rollout sequence
1. Add backend auth middleware behind env flag `AUTH_REQUIRED=true`.
2. Configure frontend auth and token header propagation.
3. Enable auth in non-prod.
4. Enable auth in prod.
