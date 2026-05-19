# Phase 7 docker-compose smoke test

**Goal:** Confirm the stack defined in `infra/compose/docker-compose.yml` boots, the three services talk to each other and to MinIO/Redis, and a full job runs end-to-end against real Claude. Phase 7 closes only when every step below passes on your machine.

## 0. Prereqs

- [ ] `docker --version` ≥ 24 and `docker compose version` ≥ 2.20.
- [ ] `~12 GB` free disk (Ubuntu base + ffmpeg + node + npm cache for the two heavy images).
- [ ] You have a real `ANTHROPIC_API_KEY`, a real `OPENAI_API_KEY`, and a `JWT_SECRET` ≥ 32 chars.
- [ ] You're ok running the test against your real Anthropic / OpenAI quota. Expect ~1 Claude call (~10 KB input incl. base64 frames) and 0 Whisper calls if your test clip is silent.

## 1. Env setup

```bash
cd infra/compose
cp ../../.env.example .env
```

Edit `infra/compose/.env`. Required:

- [ ] `JWT_SECRET=<≥32 random chars>` — zod enforces the length, the gateway refuses to boot otherwise.
- [ ] `ANTHROPIC_API_KEY=sk-ant-...`
- [ ] `ANTHROPIC_MODEL=claude-sonnet-4-6` — **override the PRD placeholder** (`claude-sonnet-4-20250514`) to a current model id, otherwise the orchestrator's first Claude call 404s and the job fails through T-13's retry path.
- [ ] `OPENAI_API_KEY=sk-...` — needed only if your test clip has audio; the orchestrator ffprobes for an audio stream first and skips Whisper on silent clips.

Optional but useful for the smoke:

- [ ] `AWS_S3_INPUT_BUCKET=clipdirector-input`, `AWS_S3_OUTPUT_BUCKET=clipdirector-output` (defaults match).
- [ ] `AWS_ACCESS_KEY_ID=minioadmin`, `AWS_SECRET_ACCESS_KEY=minioadmin` (matches the MinIO root creds in compose).

## 2. Music library

The render-worker bind-mounts `./music/` from the repo into `/opt/clipdirector/music`. The current state is gitkeep-only — there are no real `.mp3`s under any mood directory.

Choose one of:

- (a) **Drop a single licensed `.mp3` into `music/energetic/`.** Then use `"musicMood": "energetic"` in the test job.
- (b) **Use `"musicMood": "none"` in the test job.** The selector short-circuits and the pipeline's mix step is skipped. Faster, no asset needed. **Recommended for the smoke test.**

## 3. Build

```bash
docker compose --env-file .env build
```

- [ ] First build pulls `node:20-alpine`, `node:20` (debian), `ubuntu:24.04`, `redis:7-alpine`, `minio/minio:latest`, `minio/mc:latest`. Expect 5–15 min on a fresh host.
- [ ] All three app images report `naming to docker.io/clipdirector/<service>:dev done`.
- [ ] No errors about `pnpm: not found` (corepack should bring it in). If you see one: `corepack` is gated by node version — the Dockerfiles use Node 20 which is fine, but if your buildkit is old, set `DOCKER_BUILDKIT=1`.

## 4. Start

```bash
docker compose --env-file .env up -d
docker compose --env-file .env ps
```

Expect all six services to show `Up` (redis, minio, minio-init exiting 0, api-gateway, orchestrator, render-worker). `minio-init` is one-shot — `Exited (0)` is success.

- [ ] `docker compose logs minio-init` ends with `buckets ready`.
- [ ] `docker compose logs api-gateway | grep "listening"` shows port 3000.
- [ ] `docker compose logs orchestrator | tail -20` shows BullMQ worker ready, no crash.
- [ ] `docker compose logs render-worker | tail -20` shows BullMQ worker ready, no crash.

## 5. Health endpoint

```bash
curl -s http://localhost:3000/health | jq
```

- [ ] HTTP 200.
- [ ] `redis.status === "ok"` with a small `latencyMs`.
- [ ] `queues.orchestrator.waiting === 0`.
- [ ] `version` matches what's in the gateway's `package.json`.

If 503: check `docker compose logs api-gateway` for the failed dep — usually Redis hostname (should be `redis`, not `localhost`) or `JWT_SECRET` length.

## 6. Register a user + get a token

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"correct-horse-battery-staple"}' \
  | jq -r .accessToken)
echo "$TOKEN" | head -c 40
```

- [ ] You see a JWT (`eyJ...`). If not, the register call failed — `echo` the full response without `jq -r .accessToken` to see the error envelope.

## 7. Make a real test clip

```bash
ffmpeg -y \
  -f lavfi -i 'testsrc=duration=3:size=320x240:rate=10' \
  -c:v libx264 -pix_fmt yuv420p -an \
  /tmp/smoke-clip.mp4
```

- [ ] `/tmp/smoke-clip.mp4` exists, ~30 KB. `-an` keeps it silent so Whisper is skipped.

## 8. Submit the job

```bash
JOB=$(curl -s -X POST http://localhost:3000/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -F 'json={"userPrompt":"snappy 6 second cut","platform":"tiktok","musicMood":"none","captionStyle":"none"}' \
  -F 'clips=@/tmp/smoke-clip.mp4;type=video/mp4' \
  -F 'clips=@/tmp/smoke-clip.mp4;type=video/mp4' \
  | jq -r .jobId)
echo "jobId=$JOB"
```

- [ ] You get a UUID jobId back. HTTP 202.
- [ ] `docker compose logs orchestrator -f` shows `Clips downloaded`, `Frames sampled`, `Transcription complete` (with `transcriptedClips: 0`), `Render job enqueued`.
- [ ] `docker compose logs render-worker -f` then shows `clips downloaded`, `music selected` (or the no-music path), `render complete`, `temp dir removed`.

## 9. Poll to complete

```bash
while :; do
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/jobs/$JOB | jq -r .status)
  echo "$(date +%T) $STATUS"
  [[ "$STATUS" == "complete" || "$STATUS" == "failed" ]] && break
  sleep 2
done
```

- [ ] Terminal state is `complete`, not `failed`. Expect under 60s end-to-end for a 2-clip silent test.
- [ ] If `failed`: `curl ... /jobs/$JOB | jq .errorMessage` shows the cause. Common ones: bad `ANTHROPIC_MODEL`, missing OPENAI key on a clip with audio.

## 10. Download the MP4

```bash
URL=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/jobs/$JOB/download | jq -r .url)
curl -s -o /tmp/smoke-output.mp4 "$URL"
ffprobe -v error -show_entries format=duration,size,bit_rate /tmp/smoke-output.mp4
```

- [ ] `duration` ≈ 4s (two 2-second trims concatenated).
- [ ] `size` > 1 KB.
- [ ] ffprobe doesn't error. Open in a player if you want — the file should actually play.

## 11. Failure-mode spot checks (optional but recommended)

These exercise the Phase 6 retry + DLQ paths inside the live stack, not just under vitest.

### 11a. Render-worker crash mid-job

```bash
# Submit a job and immediately kill the render-worker while it's processing
docker compose --env-file .env kill render-worker
docker compose --env-file .env up -d render-worker
```

- [ ] BullMQ stalled-job recovery: job re-enters the queue and the new render-worker picks it up.
- [ ] Final status is `complete`. If `failed`, the DLQ tick (10-min interval in prod, see below) eventually reconciles — but for the smoke this would time out.

### 11b. DLQ tick interval

The default `intervalMs` is 10 min, too slow for a smoke. To see the DLQ in action, either:

- (a) Run T-13/T-14 again via `pnpm -r test --filter @clipdirector/api-gateway` on the host (they use a 200ms tick), or
- (b) Submit a job with a deliberately bad `ANTHROPIC_MODEL` value and wait 10+ min. The orchestrator queue's `defaultJobOptions.attempts` (set in `queue-client/src/index.ts`) will retry 3× over backoff, then the DLQ tick should mark it `failed` if the worker didn't already.

## 12. Teardown

```bash
docker compose --env-file .env down -v
```

- [ ] `-v` removes the named volumes (`redis-data`, `minio-data`, `api-gateway-data`, `render-tmp`). Skip `-v` to preserve them between runs.

## What to capture for the summary doc

If the smoke passes cleanly, append a short note to `Docs/project_completion_summary.md` under the Phase 7 entry: "Manual `docker compose up` smoke test passed on YYYY-MM-DD against `ANTHROPIC_MODEL=<model>`. Phase 7 verified."

If anything fails, capture:
- Which step number.
- The exact log line from `docker compose logs <service> --tail 50`.
- The job's Redis status via `docker compose exec redis redis-cli HGETALL job:<jobId>`.

Then we can decide whether to fix in Phase 7 or open a Phase 8 follow-up.
