# ClipDirector AI

Agentic backend pipeline + Android client for AI-directed short-form video editing.

See `ClipDirector_Engineering_PRD.md` for the full engineering spec. Phase status lives in `Docs/project_completion_summary.md`.

## Prereqs

- Node 20 LTS (pinned in `.nvmrc`)
- pnpm 9.x (managed via corepack — `corepack enable`)
- FFmpeg + FFprobe on `PATH` (for `render-worker`)
- Redis 7+ (for BullMQ — local dev or hosted)
- AWS account with two S3 buckets (input + output) or MinIO/LocalStack for local dev

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env   # fill in secrets locally
pnpm build
```

## Layout

```
apps/
  api-gateway/    # Express — POST /jobs, status polling
  orchestrator/   # Frame sampling + Claude reasoning + manifest validation
  render-worker/  # FFmpeg pipeline + S3 upload
  android/        # Kotlin + Compose client (Phase 2)
packages/
  shared-types/   # Cross-service TypeScript interfaces + env schemas
  queue-client/   # BullMQ wrapper
  storage-client/ # S3 abstraction
  logger/         # Pino structured logger
infra/
  docker/         # Per-service Dockerfiles
  compose/        # Local dev stack
  scripts/        # VM setup, music seed, env bootstrap
```

## Phase status

See `Docs/project_completion_summary.md` for the rolling change log.
