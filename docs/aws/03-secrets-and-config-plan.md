# Secrets and Configuration Plan

## Current secret categories
From `.env` and backend usage:
- LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- Google OAuth: `GOOGLE_CLIENT_ID*`, `GOOGLE_CLIENT_SECRET*`, `GOOGLE_REFRESH_TOKEN*`, `GOOGLE_REDIRECT_URI`
- Todoist: `TODOIST_API_TOKEN*`
- Observability: `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`
- App config flags: `REQUIRE_APPROVAL_FOR_WRITES`, model ids, etc.

## AWS target mapping

### Secrets Manager (sensitive)
- OpenAI/Anthropic keys
- Google OAuth client secrets and refresh tokens
- Todoist tokens
- LangSmith API key

### SSM Parameter Store (non-sensitive config)
- model names
- feature flags
- backend URL
- CORS allowed origins

## ECS injection strategy
- ECS Task Definition `secrets` -> Secrets Manager ARNs.
- ECS Task Definition `environment` -> non-sensitive variables.

## Amplify frontend env strategy
- `NEXT_PUBLIC_BACKEND_URL`
- Cognito public config values (User Pool ID, App Client ID, Domain)
- Never expose private API keys in frontend env.

## CORS / origin config
Replace `cors({ origin: true })` in backend with explicit allow-list:
- Amplify production domain
- Amplify preview domains (optional)

## Operational guardrails
- Rotate API keys every 90 days.
- Use separate secrets per environment (`dev`, `staging`, `prod`).
- Least-privilege IAM for ECS task role.
