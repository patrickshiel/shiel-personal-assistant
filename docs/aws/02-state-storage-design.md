# State Storage Migration Design (FS -> DynamoDB/S3)

## Current local dependencies
- `backend/src/api/job-store.ts` writes JSON job files under `state/jobs`.
- `backend/src/orchestrator/state.ts` writes:
  - `state/orchestrator-state.json`
  - `state/memory.json`
- `backend/src/lib/paths.ts` anchors all state to local repo disk.

This is not durable on ECS tasks.

## Target storage

## 1) DynamoDB tables

### `assistant_jobs`
- PK: `userId` (S)
- SK: `jobId` (S)
- Attributes: `createdAt`, `updatedAt`, `type`, `status`, `outputText`, `proposals`, `executionResults`, etc.
- GSI1:
  - PK: `userId`
  - SK: `createdAt` (for listing latest jobs)

### `orchestrator_state`
- PK: `userId`
- SK: `entityType` (`orchestrator`)
- Attribute: `triggers` map, `updatedAt`

### `memory_entries`
- PK: `userId`
- SK: `memoryAt` (`<ISO>#<id>`)
- Attributes: `id`, `type`, `content`, `at`
- Query by user sorted descending for prompt injection.

## 2) Optional S3
Use for larger generated markdown/report artifacts currently under `state/` if needed.

- Bucket: `shiel-assistant-artifacts-<env>`
- Key prefix: `<userId>/weekly-prep/...`

## Access abstraction
Introduce store interfaces and adapters:
- `JobStore` interface with `create/save/load/list`.
- `OrchestratorStateStore` interface.
- `MemoryStore` interface.

Default to DynamoDB adapter in cloud, FS adapter locally.

## Data migration
- One-time script to read local `state/` and write into DynamoDB for initial bootstrap.

## Failure behavior
- If DynamoDB unavailable, return 503 from API endpoints that need state writes.
- Do not silently fallback to ephemeral container disk in production.
