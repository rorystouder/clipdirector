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

**Heads up: the presigned URL from `/jobs/:id/download` will look reachable but won't work from your host in compose-mode.** It points to `http://minio:9000/...` — that hostname only resolves inside the compose network, and the signature is bound to that host so you can't substitute `localhost`. The fix is Phase 8 (prod-mode against real S3 URLs). For this smoke, verify via the MinIO console instead.

### Recommended: download via the MinIO console

1. Open **http://localhost:9001** in your browser.
2. Log in. Credentials are MinIO's root creds — which compose tries to set from `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in `.env`, but **MinIO persists root creds across restarts**, so if the volume was ever initialized with defaults, that's still what works. Try `minioadmin` / `minioadmin` first; if rejected, try your `.env` AWS keys.
3. Browse to the `clipdirector-output` bucket (or whatever `AWS_S3_OUTPUT_BUCKET` resolves to). You should see `output/<userId>/<jobId>/output.mp4`.
4. Click the file → use the download button on its detail panel → save locally.
5. Validate:
   ```bash
   ffprobe -v error -show_entries format=duration,size,bit_rate ~/Downloads/output.mp4
   xxd ~/Downloads/output.mp4 | head -1
   ```

- [ ] `duration` is close to your manifest's `targetDurationSec` (~6s for the default smoke prompt).
- [ ] `size` > 1 KB.
- [ ] ffprobe doesn't error.
- [ ] `xxd` first line shows `ftyp` characters in bytes 4–8.

### Alternative: AWS CLI against MinIO's host port

If you'd rather stay in the terminal, you can hit MinIO directly with `aws s3 cp --endpoint-url http://localhost:9000`. You need MinIO's *actual* root credentials, which (per the gotcha above) may not match what's in your `.env`. Try `minioadmin/minioadmin` first.

```bash
AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
  aws --endpoint-url http://localhost:9000 --region us-east-1 \
      s3 ls s3://clipdirector-output/ --recursive

KEY=$(AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
      aws --endpoint-url http://localhost:9000 --region us-east-1 \
          s3api list-objects-v2 --bucket clipdirector-output \
          --query 'Contents[?ends_with(Key, `.mp4`)].Key | [0]' --output text)

AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
  aws --endpoint-url http://localhost:9000 --region us-east-1 \
      s3 cp "s3://clipdirector-output/$KEY" /tmp/smoke-output.mp4

ffprobe -v error -show_entries format=duration,size,bit_rate /tmp/smoke-output.mp4
```

If you get `InvalidAccessKeyId`, MinIO's root creds aren't `minioadmin`. Try your `.env` values; if neither works, `docker compose down -v && up -d` to wipe the MinIO volume and re-init from current `.env`.

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

---

# Phase 8 — Prod-mode smoke test (real AWS S3)

Same flow as Phase 7 but uses `docker-compose.prod.yml` to disable MinIO and target real AWS S3. **This costs real AWS dollars** — a few cents for the bucket ops, a few cents for the Claude API call. Negligible but not zero.

## 13. Prereqs (in addition to Phase 7 prereqs)

- [ ] AWS buckets exist and are correctly configured (per the AWS-bucket walkthrough — public-access-block, SSE, lifecycle). Defaults: `gain3d-clipdirector-input` and `gain3d-clipdirector-output` in `us-east-1`.
- [ ] IAM user `clipdirector-app` exists with the scoped inline policy (`GetObject`/`PutObject`/`DeleteObject` on `/*` of both buckets, no ListBucket).
- [ ] You have the `clipdirector-app` access keys saved.
- [ ] `aws --profile clipdirector-app sts get-caller-identity` returns the right ARN (positive proof the keys still work).
- [ ] You're prepared to do a Phase 7 dev-mode teardown first if a dev stack is currently running — port 3000 will conflict otherwise.

## 14. Update `.env` for prod mode

Edit `infra/compose/.env`:

```bash
# These MUST be the real clipdirector-app keys (not minioadmin):
AWS_ACCESS_KEY_ID=AKIA...                       # clipdirector-app access key
AWS_SECRET_ACCESS_KEY=<secret>                  # clipdirector-app secret

# These MUST be the real bucket names (not the clipdirector-input default):
AWS_S3_INPUT_BUCKET=gain3d-clipdirector-input
AWS_S3_OUTPUT_BUCKET=gain3d-clipdirector-output

# Leave these unset — the prod override clears them automatically:
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false
```

`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` are ignored in prod mode (MinIO doesn't run), so they don't matter.

## 15. Verify the prod config before booting

Sanity-check what compose will actually start, without spending build/start time:

```bash
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  config --services
```

- [ ] Output shows exactly 4 services: `redis`, `api-gateway`, `orchestrator`, `render-worker`. **No `minio`, no `minio-init`.**

Also check the env that will be passed to the app services:

```bash
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  config | grep -E 'AWS_S3_(ENDPOINT|FORCE_PATH_STYLE):' | head
```

- [ ] Both should appear as empty strings (`AWS_S3_ENDPOINT: ""`, `AWS_S3_FORCE_PATH_STYLE: "false"`).

## 16. Bring up the prod stack

```bash
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d

docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  ps
```

- [ ] 4 containers running (no minio, no minio-init).
- [ ] `compose-api-gateway-1` on port 3000.
- [ ] No `Restarting` or `Exit 1`.

## 17. End-to-end against real S3

Mirror Phase 7 steps 6–10 (register, make clip, submit, poll, download). The only difference: output lands in real AWS S3, not MinIO.

After the job completes, verify the artifacts in real AWS using your admin AWS CLI profile (named `admin` in the examples below — substitute whatever you called yours when running `aws configure --profile <name>`). The `clipdirector-app` user intentionally lacks `ListBucket`, so it cannot run these commands:

```bash
aws --profile admin s3 ls s3://gain3d-clipdirector-input/  --recursive
aws --profile admin s3 ls s3://gain3d-clipdirector-output/ --recursive
```

- [ ] Input bucket shows the uploaded clip(s) at `input/<userId>/<jobId>/...`.
- [ ] Output bucket shows the rendered MP4 at `output/<userId>/<jobId>/output.mp4` with non-zero size.

Download the output to validate:

```bash
aws --profile admin s3 cp \
  "s3://gain3d-clipdirector-output/<the-output-key>" /tmp/prod-output.mp4
ffprobe -v error -show_entries format=duration,size,bit_rate /tmp/prod-output.mp4
```

- [ ] Valid MP4, expected duration, no ffprobe errors.

Bonus: the presigned URL from `/jobs/:id/download` should now actually work from your host (it points to `https://gain3d-clipdirector-output.s3.amazonaws.com/...`, publicly resolvable). Test by curling it directly.

## 18. Verify key rotation requires only a service restart (PRD item 58)

```bash
# Create new access keys
aws --profile admin iam create-access-key --user-name clipdirector-app
# (copy the new AKIA... and SecretAccessKey into infra/compose/.env)

# Restart just the app services — no rebuild needed
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  restart api-gateway orchestrator render-worker

# Submit another job, verify it still completes (uses new keys)

# Once verified, delete the old access key
aws --profile admin iam list-access-keys --user-name clipdirector-app
aws --profile admin iam delete-access-key \
  --user-name clipdirector-app --access-key-id <OLD_AKIA_ID>
```

- [ ] Restart finishes in ~5s (no `docker compose build`).
- [ ] Second job completes successfully.
- [ ] Old key deleted; `list-access-keys` shows only one Active key.

## 19. Prod-mode teardown

```bash
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  down
```

No `-v` because there are no volumes worth wiping in prod mode (MinIO didn't run; api-gateway's SQLite is in a named volume, keep it for the next session).

**Don't forget to clean up the S3 artifacts the smoke created** if you don't want them counting against your bill / lifecycle clock:

```bash
aws --profile admin s3 rm s3://gain3d-clipdirector-input/  --recursive
aws --profile admin s3 rm s3://gain3d-clipdirector-output/ --recursive
```

(Or wait 7 days for the input lifecycle and 30 days for output to do it for you.)

## What to capture for Phase 8

If everything passes, append to `Docs/project_completion_summary.md` under a new Phase 8 entry: "Prod-mode smoke verified on YYYY-MM-DD against real AWS S3 buckets gain3d-clipdirector-input / -output."
