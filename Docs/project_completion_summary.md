# ClipDirector AI — Project Completion Summary

Living log of changes, in reverse-chronological order. Each entry: date, scope, what changed, what's verified, what's open.

---

## 2026-05-16 — Phase 0: Monorepo Foundation (in progress)

### Scope
Initial repository scaffold per `ClipDirector_Engineering_PRD.md` Section 16, Phase 0 checklist (steps 1–8) plus the Android scaffold (steps 48–50). All work is pre-scaling MVP.

### Decisions taken (with user)
- **Build order**: Follow PRD. Backend Phase 0 first; Android stub only.
- **Architecture fidelity**: Follow PRD exactly (pnpm monorepo, 3 services, BullMQ + Redis, manifest validation, FFmpeg pipeline).
- **Storage backend**: AWS S3 (override Azure Blob in PRD). Env vars and `StorageClient` interface updated accordingly. Azurite replaced by LocalStack/MinIO in future docker-compose.

### Tooling deviations surfaced
- PRD says Node 20 LTS, host runs Node 22.22 — pinned 20 in `.nvmrc`/`.node-version`, no strict `engines` so local install on 22 still works.
- PRD says pnpm 9.x, host runs pnpm 10.8 — pinned 9.15.0 via `packageManager` so corepack provisions the right version.
- Host has Java 8 — Android Gradle 8.x needs JDK 17+. Scaffold writes the project files but does **not** verify the Android build. Surface to user before Phase 2 Android work.

### Changes
- `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json` — workspace foundation, strict TS mode.
- `.nvmrc`, `.node-version`, `.gitignore`, `.env.example` — runtime pins and env template.
- `packages/logger` — Pino structured logger, typed singleton, per Section 14.2 required fields.
- `packages/shared-types` — all interfaces from Section 4 (`job.ts`, `manifest.ts`, `queue.ts`) plus env schemas (Section 5.1) adapted for AWS S3.
- `packages/queue-client`, `packages/storage-client` — Phase 0 stubs (package.json + tsconfig + placeholder index). Real impl is Phase 1.
- `apps/api-gateway`, `apps/orchestrator`, `apps/render-worker` — Phase 0 stubs. Real impl Phases 2/3/4.
- `apps/android` — Kotlin + Compose scaffold per Section 15. Five screen files with `// TODO Phase 2` placeholders. `ClipDirectorApi` Retrofit interface created.

### Verification status
- `pnpm install` — **passed** (8 workspace projects linked; 17 packages on disk).
- `pnpm -r build` — **passed** (Phase 0 checkpoint met; zero TS errors across all 7 buildable workspaces; `apps/android` is not a pnpm workspace).
- Android build — **explicitly not attempted**. Host has JDK 1.8; AGP 8.x needs JDK 17+. Files written but unverified.

### Mid-flight corrections
- Added `@types/node` to root `devDependencies` and `"types": ["node"]` to `tsconfig.base.json` after the first build failed on `process` references in `packages/logger`.
- Removed `references` blocks from child tsconfigs after second build failed (`TS6306`: referenced project needs `composite: true`). pnpm's topological build order in `pnpm -r build` already covers ordering; `tsc -b` is not used here. Surfaced rather than blindly adding `composite: true` everywhere (Rule 7).

### Open / Next (after Phase 0)
- Phase 1: implement `queue-client` (BullMQ wrapper, `setJobStatus`/`getJobStatus` helpers) and `storage-client` (`@aws-sdk/client-s3` + presigner) with unit tests per PRD T-series. Tests should be written to fail/expose (global rule).
- When Android work resumes: install JDK 17 on host, generate Gradle wrapper, install Android SDK 34, create `local.properties`.

---

## 2026-05-16 — Phase 1: Queue and Storage Clients (complete)

### Scope
PRD Section 16 Phase 1 checklist steps 9–13: implement queue-client + storage-client, write unit tests against real infra, verify all pass.

### Changes
- `packages/queue-client/src/index.ts` — BullMQ wrapper per PRD Section 9. Exports `QUEUE_NAMES`, `getRedisConnection`, `createRedisClient`, `createOrchestratorQueue`, `createRenderQueue`, plus `setJobStatus`/`getJobStatus`/`getJobStatusTtlSeconds` for the `job:{id}` HSET pattern with 7-day TTL. Optional fields (`outputUrl`, `errorMessage`) are stripped on write so Redis never stores the literal string `"undefined"`. `progress` is coerced back to `number` on read.
- `packages/storage-client/src/index.ts` — `StorageClient` class (real implementation, was an interface stub). AWS SDK v3 (`@aws-sdk/client-s3`) + `@aws-sdk/s3-request-presigner`. Supports MinIO/LocalStack via `endpoint` + `forcePathStyle`. Methods: `upload` (Buffer xor filePath, mutually exclusive — throws otherwise), `download`, `readToBuffer`, `getSignedUrl` (rejects expiry ≤ 0), `delete`. Lazy singleton + `_resetDefaultStorageClient` test seam.
- Test infra: `vitest` + `testcontainers` at root, plus per-package vitest configs (`testTimeout: 60s`, `pool: 'forks'`, `singleFork: true` so the testcontainer is shared across the suite).
- `packages/queue-client/src/index.test.ts` — 8 tests against a real `redis:7-alpine` testcontainer. Covers: typed payload round-trip through a Worker; render-queue retry/backoff defaults; full `JobStatusRecord` roundtrip with `progress` returned as `number`; undefined optional fields not persisted as strings; partial update merge semantics; null on missing key; 7-day TTL within ±60s; `updatedAt` refreshed on every write.
- `packages/storage-client/src/index.test.ts` — 9 tests against a real `minio/minio` testcontainer. Covers: missing-credentials constructor throw; Buffer→read roundtrip with binary equality; filePath→read roundtrip with binary equality; upload-with-neither rejection; upload-with-both rejection; download-to-disk byte equality; signed URL actually serves the object over plain HTTP `fetch`; expiry ≤ 0 rejection; delete makes subsequent reads fail.
- `tsconfig.json` in both packages: added `exclude: ["src/**/*.test.ts", "vitest.config.ts", "dist"]` so `tsc --build` does not emit test files.

### Verification status
- `pnpm -r build` — **passed**.
- `pnpm -r test` — **passed**: 17 / 17 (queue-client 8 + storage-client 9). Both suites run real containers (Redis 7-alpine, MinIO latest) via testcontainers; no mocks, no stubs.
- All tests are negative-or-edge-shaped per the global "tests must fail or expose errors" rule. Examples: forbid-both/forbid-neither uploads, expiry-must-be-positive, partial-update-must-merge, undefined-must-not-leak-as-string.

### Notes / surface items
- Docker daemon is available on the host (29.1.3); both containers spin up in <5s and the full suite finishes in ~3s of test time.
- `crypto-pro/ssh2` triggered a one-time native build during install. No action needed but flagged for the record.

### Open / Next (after Phase 1)
- Phase 2: api-gateway (Express, JWT, `POST /jobs` with multer + zod, `GET /jobs/:id`, `GET /health`). Will land integration tests T-01, T-02, T-03, T-11.
- Decide on auth model for MVP (PRD allows "simple secret exchange" placeholder for now).
- Music library bootstrap: PRD Section 8.4 expects `${MUSIC_LIBRARY_PATH}/<mood>/*.mp3` plus a `metadata.json`. Needs licensed assets before Phase 4 integration tests can run.

---

## 2026-05-16 — Phase 2: API Gateway with real auth (complete)

### Scope
PRD Section 16 Phase 2 checklist (steps 14–21) **with the PRD §6.2 placeholder auth replaced by a real model** at the user's explicit request.

### Auth model (replaces PRD §6.2 placeholder)
- **Identity**: email + password (email normalized to lowercase, max 254 chars).
- **Password hashing**: Argon2id via `argon2`. Memory cost 19,456 KiB, time cost 2, parallelism 1. Minimum password length 12.
- **Access token**: HS256 JWT, 15-minute TTL (env-tunable). Claims: `sub` (userId), `email`, `iat`, `exp`. Signed with `JWT_SECRET` (zod-enforced 32+ chars).
- **Refresh token**: opaque 256-bit random hex (64 chars). Stored as SHA-256 hash in `refresh_tokens`. **Rotated on every use** — old token revoked, new pair issued. 7-day TTL (env-tunable).
- **Revocation**: `revoked_at` column on `refresh_tokens`. Logout revokes the presented refresh; the access JWT remains valid until its 15-min expiry.
- **Storage**: SQLite via `better-sqlite3` (file path from `DATABASE_FILE`, WAL mode, FKs enforced). Two tables: `users`, `refresh_tokens`. Schema applied idempotently on boot. Repository pattern (`AuthRepository`) keeps the Postgres swap small later.
- **Endpoints**:
  - `POST /auth/register` → 201 + `{ user, accessToken, refreshToken, expiresInSec }`
  - `POST /auth/login` → 200 + same shape; uniform 401 on bad creds **and** unknown email (no existence leak)
  - `POST /auth/refresh` → 200 + rotated pair; replayed/expired/revoked refresh → 401
  - `POST /auth/logout` → 204; revokes the refresh
  - `GET /auth/me` → 200 + `{ user }` (Bearer-protected)
- **Middleware**: `requireAuth` parses `Authorization: Bearer …`, verifies HS256 with `JWT_SECRET`, attaches `req.user = { id, email }` via a global `Express.Request` augmentation.

### Jobs endpoints (per PRD §6.2, §6.3)
- `POST /jobs` — auth required; `multer.memoryStorage()` with `MAX_CLIPS_PER_JOB` file limit and `MAX_CLIP_BYTES` size limit; `fileFilter` rejects non-`video/*` MIME types as 400 (`ValidationError`); `json` multipart field parsed and validated with zod (`userPrompt`, `platform`, `musicMood`, `captionStyle`). Each clip uploaded to S3 at `input/{userId}/{jobId}/clip_{nn}`; initial `JobStatusRecord` written via `setJobStatus`; orchestrator job enqueued. Returns 202 + `{ jobId, status: 'queued' }`.
- `GET /jobs/:jobId` — auth required; reads via `getJobStatus`; **403 if the JobStatusRecord's `userId` doesn't match the JWT subject** (no global admin role); 404 if missing.
- `GET /jobs/:jobId/download` — auth + ownership check; only valid when `status === 'complete'`; returns a presigned URL valid for 1 hour.
- `GET /health` — Redis ping with latency, orchestrator queue job counts, version. 200 / 503 based on health.

### Other changes
- `apps/api-gateway/src/{app.ts,index.ts}` — Express factory pattern: `createApp(deps)` for tests; `index.ts` wires real Redis, Queue, StorageClient, SQLite. Centralized error middleware translates `HttpError` subclasses and `MulterError` into JSON shapes (`{ code, message, details }`).
- `apps/api-gateway/src/errors.ts` — typed error hierarchy (`HttpError` + `Validation/Unauthorized/Forbidden/NotFound/Conflict`).
- `packages/shared-types/src/env.ts`: tightened `JWT_SECRET` to 32+ chars; added `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `DATABASE_FILE`, `MAX_CLIP_BYTES`. `validateEnv` signature changed to `<S extends z.ZodTypeAny>(schema: S) => z.infer<S>` so zod-with-defaults infers required output types correctly.

### Verification status
- `pnpm -r build` — **passed** (zero TS errors).
- `pnpm -r test` — **40/40 passing**:
  - `queue-client` 8, `storage-client` 9, `api-gateway` 23.
  - Integration suite spins real `redis:7-alpine` + `minio/minio` testcontainers; supertest hits the Express app with in-memory SQLite per run.
  - Auth tests (failure-shaped): duplicate-email 409, short password 400, unknown-email 401 (no existence leak), wrong-password 401, missing/malformed/wrong-secret JWTs 401, refresh-rotation-and-replay rejection, logout-revokes-refresh.
  - Jobs tests: T-01 (202 + Redis status record), T-02 (>12 clips 400), T-03 (non-video MIME 400), missing-auth 401, missing-json 400, malformed-json 400, T-11 (status round-trip with `progress` as number), cross-user 403, unknown-job 404.

### Surface items
- `multer 1.4.5-lts` and `uuid 9.0.1` show npm deprecation warnings. Both still install and work cleanly. Migrating to multer 2.x is a future task.
- `Access token` lifetime is intentionally short (15 min) and the JWT is not server-side revocable mid-lifetime — that's standard. If we need stricter mid-flight revocation later, a Redis-backed JWT denylist is the next step.
- No rate limiting on `/auth/login` or `/auth/register` yet — should be added before this faces the public internet.
- SQLite is fine for MVP; will need Postgres before multi-instance api-gateway deployment.

### Open / Next (after Phase 2)
- Phase 3: orchestrator service (frame sampling via ffmpeg, Whisper transcription via OpenAI, Claude API reasoning, manifest validation). Tests T-04 through T-07.

---

## 2026-05-16 — Phase 2 follow-up: security + correctness sweep

Closed the four surface items called out at the end of Phase 2.

### #1 + #3 — multer 1.4 → 2.1.1+ (HIGH-severity DoS vulns ×7)
Dependabot showed 7 open HIGH advisories against `multer@1.4.5-lts.2`, all DoS via various malformed-request paths. All fixed by ≥ 2.1.1. Upgraded to `multer@^2.1.1` + `@types/multer@^2.0.0`. API is drop-in for our usage (`memoryStorage`, `array`, `fileFilter`, `MulterError` class all unchanged). The deprecation warning on install is also gone.

### #2 — rate limiting on /auth
Added `express-rate-limit@^7.4.0` with custom handler that emits our error envelope (`{ code: 'rate_limited', message: '...' }`).
- `POST /auth/register`: **5 / hour / IP** by default
- `POST /auth/login`: **10 / 15 min / IP** by default
- `POST /auth/refresh`: **30 / 15 min / IP** by default
- All limits are env-injectable via `AppDeps.config.authRateLimits` so tests pass high values without disabling the limiter.

Production note: `express-rate-limit` defaults to an in-memory store. Behind a load balancer this needs a shared backend (`rate-limit-redis`) AND `app.set('trust proxy', ...)` so per-IP counters work correctly. Not wired yet because this is single-instance MVP.

### #4 — false alarm, verified by test
I claimed multer's `LIMIT_FILE_COUNT` would let the first N clips reach S3 before rejection. Reading the actual flow:
- multer parses the multipart body and enforces `limits.files` **during parsing**, before any application handler runs.
- our S3 upload happens in the handler, **after** `upload.array('clips', N)` returns.
- if N+1 files arrive, multer aborts and the handler is never invoked.

Added test **T-02b** that runs `ListObjectsV2Command` against the input bucket before and after a 13-clip POST; key count is identical. Item closed as a false alarm.

### Test deps bumped to silence dev-scope Dependabot mediums
- `vitest@^2.1.0` (+ `@vitest/coverage-v8@^2.1.0`) — pulls in vite ≥ 5.4-patched, esbuild ≥ 0.25.
- `testcontainers@^11.0.0` — newer undici.
- Vitest 2.x has `fileParallelism: true` by default which broke a second test file's testcontainers setup. Resolved by consolidating rate-limit tests into `api.test.ts` (single set of containers, second `createApp` call with low limits).

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **43/43 passing** (queue-client 8 + storage-client 9 + api-gateway 26). Includes new T-02b S3-no-leak assertion and two rate-limit assertions (register 429 after 2, login 429 after 3).
- Dependabot recheck after push expected to close all production-scope alerts; remaining dev-scope ones should also close with the test-stack bump.
