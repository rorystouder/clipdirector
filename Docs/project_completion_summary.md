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
- `vitest@^4.0.0` (+ `@vitest/coverage-v8@^4.0.0`) — pulls in vite 7 + esbuild 0.27, which cleans the lockfile of vite 5.x and esbuild 0.21.x references. Vitest 4 flattened `poolOptions.forks` → `forks`; configs updated.
- Explicit `vite ^7` at root because vitest 4 declares vite as a peer dep that pnpm does not auto-install.
- `testcontainers@^11.0.0` — newer undici.
- Vitest 2.x+ has `fileParallelism: true` by default which broke a second test file's testcontainers setup. Resolved by consolidating rate-limit tests into `api.test.ts` (single set of containers, second `createApp` call with low limits).

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **43/43 passing** (queue-client 8 + storage-client 9 + api-gateway 26). Includes new T-02b S3-no-leak assertion and two rate-limit assertions (register 429 after 2, login 429 after 3).
- Dependabot recheck after push expected to close all production-scope alerts; remaining dev-scope ones should also close with the test-stack bump.

---

## 2026-05-16 — Phase 3: Orchestrator (complete)

### Scope
PRD Section 16 Phase 3 checklist (steps 22–29): BullMQ worker, frame sampling, Whisper transcription, Claude API reasoning, manifest validation with single retry, tests T-04 to T-07.

### Architecture
The orchestrator is split into a pure `processJob(payload, deps)` function and a thin `worker.ts` BullMQ wrapper. Every IO-bound dependency lives behind an interface so tests can stub them without losing real coverage:

- `ClipDownloader` (real impl uses StorageClient)
- `FrameSampler` (real impl spawns ffmpeg/ffprobe directly via `child_process.spawn`)
- `Transcriber` (real impl uses OpenAI `whisper-1` via `openai` SDK; checks for audio stream with ffprobe before calling)
- `ClaudeClient` (real impl uses `@anthropic-ai/sdk`)

The retry-on-validation-failure lives in `processor.ts`, not in the prompt. One Claude call → zod validate → on `ManifestValidationError`, **one** retry with `validationErrors` string appended to the user message. `ManifestParseError` (non-JSON) is NOT retried — that's a different failure mode.

### Files
- `apps/orchestrator/src/errors.ts` — `ManifestParseError`, `ManifestValidationError` (with `formatIssuesForPrompt()`), `TranscriptionError`, `FrameSamplingError`.
- `apps/orchestrator/src/manifest/validator.ts` — zod schemas exactly per PRD §7.4; refinements catch `endSec <= startSec` on both clips and captions.
- `apps/orchestrator/src/claude/prompts.ts` — `SYSTEM_PROMPT` (verbatim per PRD §7.3) + `EDIT_MANIFEST_SCHEMA_EXAMPLE` (concrete JSON shape sent to Claude as a reference) + `stripJsonFences()`.
- `apps/orchestrator/src/claude/client.ts` — builds image blocks (`type: 'image', source: { type: 'base64', media_type: 'image/jpeg' }`), interleaves clip-meta text with transcript snippets, calls `messages.create`, JSON-parses the response. Appends `validationErrors` on retry calls.
- `apps/orchestrator/src/clips/frame-sampler.ts` — direct `spawn('ffmpeg', ...)` for `-ss {t} -i {clip} -vframes 1 -vf scale=512:-1 -f image2 -q:v 5 pipe:1`; ffprobe for duration. Avoids `fluent-ffmpeg` runtime quirks (still listed for API parity, but the production code paths bypass it).
- `apps/orchestrator/src/clips/transcriber.ts` — OpenAI Whisper; ffprobe checks for an audio stream first and returns `''` for silent clips (avoids wasting API calls).
- `apps/orchestrator/src/clips/downloader.ts` — parses `s3://bucket/key`, downloads via StorageClient.
- `apps/orchestrator/src/processor.ts` — pure processJob with the full sequence + temp dir cleanup in a `finally`.
- `apps/orchestrator/src/worker.ts` — BullMQ Worker; on any throw, sets job status to `failed` with `errorMessage` and rethrows for BullMQ's retry handling.
- `apps/orchestrator/src/index.ts` — wires real deps from validated env.

### Tests (17 new, 60 total across repo)
- `manifest/validator.test.ts` (11 tests):
  - **T-05**: valid manifest passes.
  - **T-07**: clip with `endSec <= startSec` rejected.
  - Caption with `endSec <= startSec` rejected (same refinement, second path).
  - Clip id not matching `clip_NN` rejected.
  - Speed outside `[0.5, 2.0]` rejected.
  - `targetDurationSec > 90` rejected.
  - Empty clips array rejected.
  - `schemaVersion != "1.0"` rejected.
  - `aspectRatio` outside enum rejected.
  - `titleCard.durationSec > 5` rejected.
  - 13-element clips array rejected.
  - `formatIssuesForPrompt()` produces a non-empty, path-tagged string.
- `processor.test.ts` (4 tests, real Redis testcontainer, stubbed claude/downloader/sampler/transcriber):
  - One-attempt success path; render queue gets the manifest with the expected `outputBlobPath`.
  - **T-06**: invalid-then-valid retry — exactly 2 calls, second call carries `validationErrors`.
  - Invalid both times — `ManifestValidationError` thrown, render queue empty (no spurious enqueue).
  - `ManifestParseError` does **not** retry (parsing is a different failure mode from validation).
- `__tests__/integration.test.ts` (1 test, full real pipeline):
  - **T-04**: real Redis + real MinIO testcontainers + real ffmpeg on a synthetic mp4 generated via `lavfi testsrc` + real downloader + real frame sampler + stubbed transcriber + stubbed Claude. Asserts: Claude received >=1 real base64 JPEG block; render queue received the `RenderJobPayload` with original `clipUrls` and correct `outputBlobPath`; status advanced to `rendering`; temp dir was cleaned up.

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **60/60 passing** (queue-client 8 + storage-client 9 + api-gateway 26 + orchestrator 17).

### Surface items / notes
- **`fluent-ffmpeg` is deprecated** (last release 2024). We still list it for parity with the PRD, but the actual frame-sampling code uses raw `child_process.spawn` against `/usr/bin/ffmpeg`. Render-worker (Phase 4) will need to either use raw spawn or pick a maintained wrapper.
- **`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-20250514`** per the PRD; that model name predates today's lineup. Set `ANTHROPIC_MODEL=claude-sonnet-4-6` (or whichever current model fits) at deploy time.
- **No real Anthropic / OpenAI API calls in tests** — Claude is stubbed, transcriber is stubbed. The real SDK code paths are exercised only at runtime against valid API keys, not in CI.
- **Token cost note**: with the default frame interval (1/3s) and max 12 clips at 5 min, a worst-case Claude call sends ~100 base64 JPEGs. The PRD's `ANTHROPIC_MAX_TOKENS=2000` only governs the response. Input token consumption could be very high; worth measuring before exposing this to real load.
- **Whisper short-circuit**: we ffprobe for an `audio` stream before calling OpenAI. Saves API spend on silent clips; if a clip has an audio stream but only contains silence, we still call (could add silence detection later via `silencedetect` filter).

### Open / Next (after Phase 3)
- Phase 4: render-worker (FFmpeg pipeline §8.2 steps 1–9, music selection, output upload). Tests T-08, T-09, T-10.
- Music library bootstrap blocking Phase 4 end-to-end tests (needs licensed assets under `MUSIC_LIBRARY_PATH/<mood>/*.mp3`).

---

## 2026-05-16 — Phase 4: Render Worker (complete)

### Scope
PRD Section 16 Phase 4 (steps 30–36): BullMQ worker, FFmpeg pipeline §8.2 steps 1–9 in exact order, music selection, S3 upload, idempotent cleanup. Tests T-08, T-09, T-10.

### Phase 3 surface items rolled in
- **Skipped deprecated `fluent-ffmpeg`.** Every ffmpeg/ffprobe call uses raw `child_process.spawn` via a tiny `runFfmpeg`/`runFfprobe` helper. Same pattern as the Phase 3 frame sampler.
- **Music library unblocked for tests.** Instead of waiting on licensed assets, the test harness synthesizes both the source clips (`lavfi testsrc + sine`) and the music track (`lavfi sine 220Hz → libmp3lame`) at suite startup, then uploads the clips to MinIO and writes the music file into `${tmp}/music/energetic/`. Production setup (drop real `.mp3`s under `${MUSIC_LIBRARY_PATH}/<mood>/`) is unchanged.

### Pipeline (§8.2, in order)
1. **Trim** per clip — re-encode at `-preset ultrafast` for frame-accurate trim (vs `-c copy` which snaps to keyframes).
2. **Speed** adjust — `setpts` + `atempo`; skips entirely for `speed === 1.0`; branches on audio presence.
3. **Scale + pad** to `9:16` (1080×1920) / `16:9` (1920×1080) / `1:1` (1080×1080); **injects a silent stereo `anullsrc` track when input has no audio** so steps 4 and 6 see a uniform shape.
4. **Concat** via demuxer + file list with shell-safe quoting.
5. **Transitions** — **MVP implements cut only.** Manifests using `fade`/`dissolve` accept and run as cut for now. Documented; xfade is a Phase 5+ follow-up.
6. **Music mix** per the PRD's amix command: `[1:a]volume=0.3[music]; [0:a][music]amix=inputs=2:duration=first…`. **`audioDuckOnSpeech` is parsed but not yet honored** (sidechaincompress wiring deferred).
7. **Title cards** — drawtext per `TitleCard` with position-based y, `enable=between(t, start, start+duration)`, black 50% box. Optional `fontfile`; falls back to fontconfig default.
8. **Captions** — drawtext per `CaptionEntry`. Skipped when `captionStyle === 'none'` or the list is empty.
9. **Final encode** — `libx264 -crf 23 -preset fast -c:a aac -b:a 192k -movflags +faststart` per the PRD.

The pipeline writes intermediate files to `${RENDER_TEMP_DIR}/${jobId}/work/{segments,...}` exactly as §8.2 documents.

### Music selector
`createFilesystemMusicSelector({ libraryRoot })`. Lists `${root}/<mood>/`, filters `.mp3`, picks an index derived from `sha256(jobId)` so the same job reproducibly picks the same track. Raises `MusicLibraryError` on missing dir / empty mood. `mood === 'none'` short-circuits to no music.

### Processor + worker
- `renderJob(payload, deps)` is pure: download clips → pick music → run pipeline → upload → status update. **`try/finally` removes the per-job temp dir on every code path** (T-09 + T-10).
- `worker.ts` wraps it for BullMQ; on any throw it sets `JobStatusRecord.status='failed'` with the error message before rethrowing for BullMQ retry.
- Status progression: 50 → 60 (clips down) → 92 (pipeline done) → 95 (uploading) → 100 (complete).

### Tests (4 new, 64 total)
- **T-08** — Real Redis + real MinIO + real `/usr/bin/ffmpeg`. Two synthesized 3-second clips trimmed to 2s each and concatenated. Asserts: returned `outputUri`, output size > 1 KB, ffprobe sees a real video stream, duration ≈ 4s, Redis status `complete`, progress 100.
- **T-09** — After a successful render, `${tempRoot}/${jobId}` does not exist on disk.
- **T-10** — Render is forced to fail by giving a clip URL that doesn't exist in MinIO (`s3://…/does/not/exist.mp4`). `renderJob` throws, the temp dir is still gone, and the job status was not set to `complete`.
- **bad-idx** — Manifest references `clip_07` when only one source clip was provided. Caught at the trim step as a `RenderError`; cleanup still happens.

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **64/64 passing** (queue-client 8 + storage-client 9 + api-gateway 26 + orchestrator 17 + render-worker 4).
- T-08 completes in ~1.1s end-to-end (synthetic 6-second output, all 9 steps).

### Surface items / known limitations
- **MVP transitions are cut-only.** `fade`/`dissolve` manifests run as cut. Add xfade in a follow-up; this requires per-pair offset calculations and a chained filter graph.
- **`audioDuckOnSpeech` parsed but not yet enforced.** Music mix is a uniform 0.3 volume. Real ducking via `sidechaincompress` + speech-segment detection is a follow-up.
- **drawtext font is fontconfig-default** unless `fontFile` is wired in deps. Containerized deploys (Phase 7 Dockerfile) should explicitly install a font and set the path.
- **Step 9 always re-encodes** the prior intermediate, even when no titles/captions were applied. We could skip the final-encode pass when steps 7–8 were no-ops, but that complicates `+faststart` placement. Not worth optimizing yet.
- **Concurrent renders** — `concurrency: 2` per the PRD. Production sizing should benchmark FFmpeg CPU draw before raising.

### Open / Next
- Phase 5: api-gateway `GET /jobs/:jobId/download` already implemented in Phase 2; the **end-to-end test T-12** (POST /jobs → complete MP4 URL via polling) is the remaining Phase 5 deliverable. Requires both orchestrator and render-worker running against the same Redis.
- Phase 6: error handling hardening (dead-letter processor, timeout budgets §11.3), tests T-13 + T-14.
- Phase 7: Dockerfiles per §12.1, docker-compose per §12.2.

---

## 2026-05-19 — Phase 5: End-to-end test (complete)

### Scope
PRD Section 16 Phase 5 deliverable: test T-12. POST `/jobs` → orchestrator pulls and produces a manifest → render-worker produces an MP4 → `GET /jobs/:id` polls to `complete` → `GET /jobs/:id/download` returns a presigned URL that actually serves the MP4. All three services run in-process against shared real Redis + MinIO testcontainers.

### Changes
- `apps/orchestrator/package.json` and `apps/render-worker/package.json`: added `exports` maps so the test can `import { createOrchestratorWorker } from '@clipdirector/orchestrator/worker'` etc. without reaching into `dist/`. Only sub-paths actually consumed by the e2e test are exported; `./processor`, `./worker`, `./claude`, `./clips/*`, `./errors` for the orchestrator; `./processor`, `./worker`, `./music`, `./ffmpeg/runner`, `./errors` for the render-worker.
- `apps/api-gateway/package.json`: added `@clipdirector/orchestrator` and `@clipdirector/render-worker` as **devDependencies** (workspace links). Production runtime of api-gateway does not import either; only the test process does. Keeping them in `devDependencies` means `pnpm deploy --prod` for the gateway image still leaves them out.
- `apps/api-gateway/src/__tests__/e2e.test.ts` (new, 1 test):
  - Spins one `redis:7-alpine` and one `minio/minio:latest` testcontainer.
  - Creates input + output buckets, synthesizes two 3-second `lavfi testsrc + sine` clips and one `lavfi sine → libmp3lame` mp3 under `${tmp}/music/energetic/`.
  - Builds the api-gateway via `createApp({...})` against the same Redis + Storage.
  - Wires an `orchestratorWorker` and a `renderWorker` in-process. **Claude is stubbed** (returns a fixed valid manifest); the rest is real: real downloader, real ffmpeg frame sampler, real `runRenderPipeline`, real S3 upload, real presigned URL.
  - Registers a user, POSTs a multipart `/jobs` request with both clip buffers, polls `/jobs/:id` every 500ms until `complete`, requests `/jobs/:id/download`, then `fetch()`es the presigned URL and asserts the body starts with an MP4 `ftyp` box at offset 4.

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **67/67 passing**. T-12 finishes in ~3s (clip synthesis + full pipeline) on the dev host.
- The MP4 actually plays: the body fetched from the presigned URL is > 1 KB and the bytes at offsets 4–8 match `ftyp`.

### Surface items / notes
- The test stubs Claude. The Phase 3 orchestrator integration test already exercised a real `messages.create` code path against a recorded request shape; this T-12 covers the *gateway → worker → output → download* glue, not Claude itself.
- `defaultJobOptions.attempts: 1` is set on both queues inside the e2e test so a transient failure doesn't silently retry under us mid-poll. The retry path is covered by T-13/T-14 (Phase 6).
- Workspace `exports` maps mean the production build for orchestrator + render-worker now ships `.d.ts` for these sub-paths. `tsc --build` already emits them; no change to the build command.

---

## 2026-05-19 — Phase 6: Timeout budgets, retries, and DLQ (complete)

### Scope
PRD Section 16 Phase 6: per-step timeout budgets §11.3, BullMQ retry behavior that doesn't prematurely mark a job `failed` on intermediate attempts, and a dead-letter processor that reconciles BullMQ's failed-jobs list with the Redis `JobStatusRecord`. Tests T-13 (Claude timeout) and T-14 (FFmpeg failure).

### Timeout budgets (§11.3)
- `packages/shared-types/src/timeout.ts` (new) — `TimeoutError` class (carries `label` + `ms`), `withTimeout(promise, ms, label)` utility (Promise.race + `clearTimeout` in `finally`), and a `TIMEOUTS` constant table. Re-exported from `packages/shared-types/src/index.ts`.
- Budgets per PRD §11.3:
  - `clipDownloadMs`: 60s (per clip)
  - `frameSamplingMs`: 120s
  - `transcriptionMs`: 180s
  - `claudeApiMs`: 60s
  - `manifestValidationMs`: 5s
  - `renderPipelineMs`: 300s (full §8.2 pipeline)
  - `outputUploadMs`: 120s
  - `totalJobMs`: 600s
- Wired in:
  - `apps/orchestrator/src/claude/client.ts` — `client.messages.create(...)` wrapped in `withTimeout(..., TIMEOUTS.claudeApiMs, 'claude-api')`.
  - `apps/render-worker/src/processor.ts` — per-clip download, pipeline, and upload each wrapped with their own budget + label (`clip-download[i]`, `render-pipeline`, `output-upload`).

### Retry-aware worker error handling
Previously: any throw in either worker set Redis status to `failed` immediately and then rethrew. That broke BullMQ's retry semantics — the first attempt's failure looked terminal to clients even though BullMQ would re-run the job.

- `apps/orchestrator/src/worker.ts` and `apps/render-worker/src/worker.ts` — both now check `attemptsMade + 1 >= job.opts.attempts ?? 1` and **only write `status: 'failed'` on the final attempt**. Intermediate failures log as `"attempt failed, will retry"`; the terminal failure logs as `"failed (no retries left)"`. Both still rethrow so BullMQ controls the retry/backoff.
- This matches the PRD §11 expectation that transient failures are invisible to API consumers below the BullMQ retry count.

### Dead-letter processor
- `apps/api-gateway/src/dlq/processor.ts` (new) — `createDlqProcessor({ redis, queues, logger, intervalMs?, maxFailedAgeMs? })`:
  - Polls `queue.getFailed(0, 999)` on each tick (default 10 min).
  - For every BullMQ-failed job: if the `JobStatusRecord` for `data.jobId` isn't already `failed`, write it (uses `setJobStatus` so `updatedAt` and 7-day TTL behave normally). Belt-and-suspenders against any path where the worker died before writing the terminal status.
  - Prunes failed jobs older than `maxFailedAgeMs` (default 48h) from BullMQ via `job.remove()`.
  - Exposes `runOnce()` (sync, returns `{markedFailed, pruned}`) for tests, plus `start()`/`stop()` for the production interval.
- Wired in `apps/api-gateway/src/index.ts` against both the orchestrator and render queues; `stop()` is called on `SIGTERM`/`SIGINT` shutdown.

### Tests (3 new, 67 total)
- `apps/api-gateway/src/__tests__/retries-dlq.test.ts`:
  - **T-13** — A `ClaudeClient` stub that always throws `new TimeoutError('claude-api', 60_000)`. Orchestrator queue is set to `attempts: 3, backoff: { type: 'fixed', delay: 100 }`. After enqueueing one job: Claude is called exactly 3 times, the Redis status reaches `failed` with an error message containing `timeout`/`timed out`, and the DLQ processor (running with a 200ms interval) is observed reconciling. Uses a real ffmpeg `lavfi testsrc` clip uploaded to MinIO so the orchestrator gets past the download + frame-sampling stages before hitting the stubbed Claude.
  - **T-14** — Render queue set to `attempts: 2`. Input "clip" is deliberately corrupt bytes (`writeFile(corrupt, "this is not a video file…")`). FFmpeg trim step exits non-zero on both attempts; final Redis status is `failed`; DLQ tick observes the failure and reconciles.
- The existing 26 api-gateway tests + the new T-12 e2e + the two new retries-dlq tests → **29 api-gateway tests**; total repo **67/67**.

### Verification
- `pnpm -r build` — clean.
- `pnpm -r test` — **67/67 passing** (queue-client 8 + storage-client 9 + orchestrator 17 + render-worker 4 + api-gateway 29).

### Surface items / notes
- **`removeOnFail: false`** is required on both queues for the DLQ processor to actually see the failed jobs. The Phase 5 e2e queues use `attempts: 1` and don't enable this; production wiring in `apps/api-gateway/src/index.ts` will need its queue defaults reviewed before this goes live.
- **DLQ is single-process.** Multiple api-gateway instances would each tick independently and double-report. Either pin DLQ to a leader (Redlock / single replica), or move the responsibility to a dedicated worker. Not a problem at MVP scale.
- **Per-clip download timeout is per clip, not aggregate.** A manifest with 12 clips could legally stall the orchestrator for up to 12 × 60s = 12 min on downloads alone. Acceptable for now; if needed, wrap the loop with `TIMEOUTS.totalJobMs`.
- **`TimeoutError` is not retried selectively.** BullMQ retries on *any* throw including programmer errors. If we ever want to fail-fast on permanent errors (`ManifestParseError`, validator errors after the single allowed retry), the worker should classify before rethrowing. Open item.

---

## 2026-05-19 — Phase 7: Dockerfiles + docker-compose (verified)

### Scope
PRD Section 16 Phase 7 (steps 37–41): per-service Dockerfiles §12.1 and a docker-compose for local dev §12.2.

### Files
- `.dockerignore` — excludes `node_modules`, `dist`, `.next`, `.git`, `.env*` (except `.env.example`), `Zone.Identifier` cruft, IDE dirs, `Docs/`, all `*.md` except top-level `README.md`, and `apps/android`. Keeps the build context small and prevents host `node_modules` from poisoning the in-image install.
- `infra/docker/api-gateway.Dockerfile` — `node:20-alpine` builder + runtime, no ffmpeg. Uses `corepack enable` for pnpm, `pnpm install --frozen-lockfile` with a BuildKit cache mount on `~/.pnpm-store`, `pnpm -r build`, then `pnpm deploy --filter @clipdirector/api-gateway --prod /deploy` to extract the prod-only tree. `tini` as PID 1.
- `infra/docker/orchestrator.Dockerfile` — `node:20` (Debian) builder, `ubuntu:24.04` runtime with `ffmpeg` + `ffprobe` from apt and nodejs from nodesource. Sets `FFMPEG_PATH` / `FFPROBE_PATH` envs for the frame-sampler.
- `infra/docker/render-worker.Dockerfile` — same shape as orchestrator plus `fonts-dejavu-core` for drawtext, with `FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` and `MUSIC_LIBRARY_PATH=/opt/clipdirector/music`.
- `infra/compose/docker-compose.yml` — Redis + MinIO + `minio-init` (mc, creates the input/output buckets) + the three app services. Bind-mounts `./music` into the render-worker at `/opt/clipdirector/music`. `depends_on` uses healthchecks for Redis and `service_completed_successfully` for the bucket-init step.

### Verification status
- `pnpm -r build` and `pnpm -r test` still pass (Dockerfiles are not in the build/test paths).
- **Manual `docker compose up` smoke test passed on 2026-05-19** against `ANTHROPIC_MODEL=claude-sonnet-4-6`. All six containers reached their expected state (redis + minio healthy, minio-init exited 0, api-gateway / orchestrator / render-worker running). `/health` returned HTTP 200 with `redis.status: ok`. End-to-end job: registered a user, submitted two synthesized silent clips with `musicMood: "none"`, the job moved `queued → planning → rendering → uploading → complete`, and a 6.018s, 213 KB, 283 kbps MP4 landed in the output bucket. ffprobe confirmed a valid MP4 format header on the downloaded file. Phase 7 closes.

### Mid-flight fixes during the smoke
- **Host port 6379 conflicted** with another local Redis (a leftover `crispy-umbrella_redis_1` container from a different project). Resolved by remapping our compose Redis to host port 16379 in `infra/compose/docker-compose.yml`. Internal services still address `redis:6379` over the compose network. Three-line comment in the compose file documents why.

### Surface items discovered (not blocking, captured for Phase 8 / later)
- **Presigned URL host resolution.** `GET /jobs/:id/download` correctly returns a presigned URL, but in compose-mode the URL points to `http://minio:9000/...` which doesn't resolve from the host. The signature is bound to the host header so we can't just substitute `localhost`. Workarounds for verification: use the MinIO console at `localhost:9001`, or `aws s3 cp --endpoint-url http://localhost:9000`. In real-AWS mode (Phase 8) the URL will be `https://...s3.amazonaws.com/...` and this is a non-issue.
- **MinIO root credentials drift.** The compose interpolation `${AWS_ACCESS_KEY_ID:-minioadmin}` is supposed to feed real AWS keys from `.env` into MinIO as its root creds. In practice, MinIO ended up using `minioadmin/minioadmin` — most likely because the volume was initialized on an earlier compose `up` before `.env` had real keys, and MinIO persists root creds across restarts. Clean-up: `docker compose down -v` to drop the MinIO volume, then `up -d` re-initializes from current `.env`. Not done on this run because it was harmless for the smoke.
- **`AWS_S3_INPUT_BUCKET` / `AWS_S3_OUTPUT_BUCKET` in `.env` are the example defaults (`clipdirector-input` / `clipdirector-output`), not the real AWS bucket names (`gain3d-clipdirector-input` / `-output`).** MinIO created buckets with the defaults; all services agreed on the names so nothing broke. Should be updated to the real bucket names before Phase 8 prod-mode work so the env file matches reality.
- **AWS SDK v3 deprecation warning** on Node 20. The SDK will require Node ≥ 22 after January 2027. One-line bump of the Dockerfile base image (`node:20` → `node:22`, `node:20-alpine` → `node:22-alpine`) before that date.
- The orchestrator/render-worker runtime images are Ubuntu, not Alpine, because `node-gyp` + the Anthropic/OpenAI SDKs build cleaner against glibc. This costs ~150 MB per image vs. an Alpine equivalent; acceptable for dev/staging, worth revisiting before production.
- `pnpm deploy --prod` removes `devDependencies` from the deployed tree. The api-gateway image therefore does **not** include `@clipdirector/orchestrator` or `@clipdirector/render-worker` (those are dev-only deps used by the e2e test). Good.
- `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-20250514` in compose, matching the PRD. Override at deploy time to a current model id (e.g. `claude-sonnet-4-6`).
- Compose does not expose Redis or MinIO over TLS — local dev only.

### Open / Next
- Add at least one royalty-free track per mood under `music/<mood>/`. CI synthesizes its own; production needs real assets.
- Phase 9 (Android wiring) per the PRD checklist.

---

## 2026-05-19 — Phase 8: Production deployment mode (verified end-to-end)

### Scope
PRD §16 Phase 8 items 51-58 (the amendment added earlier the same day after the "AWS buckets standing by" walkthrough). Option B chosen: a `docker-compose.prod.yml` override that flips the dev MinIO stack to real AWS S3 without forking the base compose file.

### Implementation (items 51-55)
- **Base file (`infra/compose/docker-compose.yml`)**:
  - `AWS_S3_ENDPOINT` becomes `${AWS_S3_ENDPOINT:-http://minio:9000}` so users can override per .env, but defaults to MinIO for dev. Prod override sets it to literal empty string which wins over the interpolation default.
  - `AWS_S3_FORCE_PATH_STYLE` hardcoded to `"true"` in the base — dictated by backend, not user-choice. Prod override flips it to `"false"`.
  - MinIO root credentials moved to dedicated `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` vars (default `minioadmin`/`minioadmin`) instead of borrowing `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Closes the Phase 7 smoke foot-gun where real AWS keys silently doubled as MinIO root.
  - `minio-init` mc-alias step uses `MINIO_ROOT_*` instead of `AWS_*`.
- **New override (`infra/compose/docker-compose.prod.yml`)**:
  - Disables `minio` + `minio-init` via `profiles: ["dev-only-minio"]` (a profile that nobody activates, so the services don't run by default in prod mode).
  - Clears `AWS_S3_ENDPOINT` to `""` and `AWS_S3_FORCE_PATH_STYLE` to `"false"` on the three app services.
  - Replaces each app service's `depends_on` via `!override` (compose 2.24+ directive) so only `redis` remains — no minio-init dependency since it doesn't run.
- **`.env.example`** documents the dev-vs-prod env layout and adds the new `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` section. Notes that `AWS_S3_FORCE_PATH_STYLE` is not user-overridable.
- **`Docs/phase7_smoke_test.md`** appends a "Phase 8 — Prod-mode smoke test" section (steps 13-19) mirroring the dev flow but targeting the real `gain3d-clipdirector-*` buckets, with the IAM key rotation step (item 58) and explicit S3 cleanup instructions.

### Verification (items 56-58, all live)

**Item 56 — prod-mode boot.** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` brought up exactly four containers (`redis`, `api-gateway`, `orchestrator`, `render-worker`). No `minio`, no `minio-init`. `/health` returned 200, redis ok, queues at zero. Boot logs showed clean startup with no AccessDenied / InvalidAccessKey errors (no S3 traffic happens during init).

**Item 57 — real-S3 end-to-end.** Submitted a job through the prod gateway with two synthesized silent test clips. Pipeline progressed `sampling 10 → reasoning 30 → rendering 60 → complete 100` in ~6 seconds. `outputUrl` from `GET /jobs/:id` was `s3://gain3d-clipdirector-output/output/.../output.mp4` — real bucket. The presigned URL from `GET /jobs/:id/download` was `https://gain3d-clipdirector-output.s3.us-east-1.amazonaws.com/...` and **fetched cleanly from the host** — the dev-mode `minio:9000` host-resolution hang doesn't recur in prod mode, as predicted. Downloaded MP4 was 212933 bytes, duration 6.018s, valid `ftyp isom` header. `aws s3 ls` against both buckets confirmed both input clips (`input/<userId>/<jobId>/clip_00`, `clip_01`) and the rendered output existed in real AWS.

**Item 58 — key rotation via restart.** Created a new IAM access key for `clipdirector-app` via `aws iam create-access-key`, swapped it into `.env` via `perl -i -pe` (so the secret never echoed to the terminal), and ran `docker compose restart api-gateway orchestrator render-worker`. **Restart completed in 1 second** — no `Building` step, no image rebuild, exactly as the Dockerfile review predicted (no `ARG`, no `AWS_` build-time refs, no `.env` COPY). Submitted a second job through the gateway on the new key — completed end-to-end with the same `~6s sampling→reasoning→rendering→complete` progression. Deleted the old key via `aws iam delete-access-key`; `list-access-keys` confirmed only the new key remained Active. **Key rotation requires neither rebuild nor downtime beyond a sub-second restart.**

### Mid-flight observations
- **Compose override semantics.** `!reset` removes an attribute entirely; `!override` replaces it. My first cut used `!reset` to clear `depends_on` and provide a new value — the new value was silently dropped, leaving `depends_on` empty. Switched to `!override` and it worked. Worth remembering for any future compose-overlay work.
- **`${VAR-default}` vs `${VAR:-default}`.** Single-dash defaults only on unset; colon-dash defaults on unset OR empty. Since `.env.example` sets some vars to empty strings, must use colon-dash everywhere we want a meaningful default to kick in.
- **AWS_S3_FORCE_PATH_STYLE removed from user override.** Originally interpolated, but the value is purely a function of which storage backend you're talking to (MinIO → true, AWS → false) — there's no scenario where a user override makes sense. Pinned in base file, overridden in prod file. Simpler.
- **AWS CLI profile name in the smoke doc** said `--profile rory-admin`; the local profile is actually named `admin`. Patched the doc.

### Cost / artifacts of the smoke
- 2 Claude `messages.create` calls (input was ~10 KB of base64 frames each, output ~2 KB JSON manifest). Probably well under $0.10 total.
- 4 input clips + 2 output MP4s briefly in S3 (~500 KB total). Cleaned up immediately via `aws s3 rm --recursive` so the bucket lifecycle wasn't needed.
- No persistent state left in AWS beyond the IAM user/policy/active key from the original walkthrough.

### Open / Next
- Phase 9 (Android wiring) per the PRD checklist.
- Bump Dockerfile base images from `node:20` to `node:22` before January 2027 (AWS SDK v3 deprecation warning).
- Add at least one royalty-free track per mood under `music/<mood>/` for real music wiring.
