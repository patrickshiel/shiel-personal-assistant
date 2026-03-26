# Obsidian Cloud Strategy Decision

## Problem
`backend/src/tools/obsidian.ts` assumes local filesystem paths (`OBSIDIAN_VAULT_PATH*`).
In ECS this path does not exist by default.

## Options

## A) Disable Obsidian tools in cloud (recommended phase 1)
Pros:
- Fastest path to production cloud deployment
- Removes filesystem complexity
Cons:
- Lose note write/read workflows in cloud mode

Implementation:
- Add feature flag `OBSIDIAN_ENABLED=false` in cloud.
- Tool layer returns informative error when disabled.

## B) EFS-mounted vault
Pros:
- Minimal code change to keep file semantics
Cons:
- Operational overhead, mount performance, sync concerns
- Requires data sync pipeline to/from your actual Obsidian source

## C) S3-backed notes store (long-term preferred)
Pros:
- Cloud-native durability and scale
Cons:
- Requires rewrite of obsidian tool semantics and metadata/frontmatter handling

## Recommended path
1. Phase 1: Disable Obsidian in cloud.
2. Phase 2: Rebuild Obsidian tools against S3 (option C).
