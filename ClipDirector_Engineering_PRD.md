  
**ENGINEERING SPECIFICATION FOR CLAUDE CODE**

**ClipDirector AI**

Agentic Backend Pipeline

| Intended Consumer | Claude Code (agentic scaffolding) |
| :---- | :---- |
| **Document Type** | Engineering PRD — Implementation Spec |
| **Version** | 1.0 |
| **Date** | May 2026 |
| **Depends On** | ClipDirector AI Product PRD v1.0 |
| **Primary Language** | TypeScript / Node.js |
| **Target Platform** | Linux (Ubuntu 24.04), Android Client |

| ℹ NOTE This document is written for machine consumption by Claude Code. Every section is structured to enable autonomous code generation. Follow all REQUIRED callouts without deviation. Implementation order must follow the sequence in Section 3\. |
| :---- |

# **1\. Purpose and Scope**

This document is the complete engineering specification for the ClipDirector AI agentic backend pipeline. It is written for direct consumption by Claude Code and must contain sufficient precision to enable autonomous scaffolding of the full codebase without ambiguity.

This spec covers:

* Repository structure and monorepo layout

* All service implementations: API Gateway, Orchestration Service, AI Reasoning Layer, Render Pipeline Worker

* Data models, queue schema, and storage contracts

* All external API integrations (Claude API, Whisper, FFmpeg, Azure Blob Storage)

* Environment configuration, secrets management, and Docker containerization

* Testing strategy and validation checkpoints

| ✅ REQUIRED Claude Code must implement every section in the order defined in Section 3 (Implementation Sequence). Do not skip ahead. Each phase has a validation checkpoint that must pass before proceeding. |
| :---- |

# **2\. Repository Structure**

## **2.1 Monorepo Layout**

The project uses a pnpm monorepo. Scaffold this exact directory tree:

| directory tree |
| :---- |
| clipdirector/ ├── apps/ │   ├── api-gateway/          \# Express API — receives jobs from Android client │   ├── orchestrator/         \# Job coordination — Claude API \+ queue management │   ├── render-worker/        \# FFmpeg render pipeline │   └── android/              \# Kotlin Android app (Phase 2 — scaffold only now) ├── packages/ │   ├── shared-types/         \# TypeScript interfaces shared across all services │   ├── queue-client/         \# BullMQ wrapper with typed job definitions │   ├── storage-client/       \# Azure Blob Storage abstraction │   └── logger/               \# Pino structured logger, shared config ├── infra/ │   ├── docker/               \# Dockerfiles per service │   ├── compose/              \# docker-compose for local dev │   └── scripts/              \# VM setup, FFmpeg install, env bootstrap ├── .env.example              \# All required env vars — no secrets ├── pnpm-workspace.yaml ├── package.json              \# Root scripts: dev, build, test, lint └── tsconfig.base.json        \# Shared TypeScript config |

## **2.2 Package Manager and Node Version**

* Package manager: pnpm 9.x

* Node version: 20 LTS (pin in .nvmrc and .node-version)

* TypeScript: 5.4+, strict mode on

* All packages use ESM ("type": "module" in package.json)

# **3\. Implementation Sequence**

| ✅ REQUIRED Implement phases in this exact order. Each phase must compile and pass its checkpoint tests before starting the next phase. |
| :---- |

| Phase | What to Build | Checkpoint |
| :---- | :---- | :---- |
| Phase 0 | Monorepo scaffold, shared-types, logger, tsconfig, env validation | pnpm build passes across all packages with zero TypeScript errors |
| Phase 1 | queue-client package (BullMQ wrapper), storage-client package (Azure Blob) | Unit tests pass for queue enqueue/dequeue and storage upload/download |
| Phase 2 | api-gateway service: POST /jobs endpoint, auth middleware, file upload, job submission | Integration test: POST /jobs returns 202 with jobId, job appears in Redis queue |
| Phase 3 | orchestrator service: job pickup, frame sampling, Whisper transcription, Claude API call, manifest validation | Integration test: orchestrator picks job, calls Claude API, outputs valid EditManifest JSON |
| Phase 4 | render-worker service: FFmpeg pipeline, music mixer, caption overlay, output upload | Integration test: render-worker consumes manifest, produces valid MP4, uploads to blob storage |
| Phase 5 | api-gateway: GET /jobs/:id status polling endpoint, webhook callback on completion | End-to-end test: full pipeline from POST /jobs to completed MP4 URL returned |
| Phase 6 | Error handling, retry logic, dead-letter queue, health check endpoints | All error paths tested: bad manifest, FFmpeg failure, Claude API timeout |
| Phase 7 | Docker containerization, docker-compose local dev stack, environment documentation | docker-compose up starts all services, end-to-end test passes in container |

# **4\. Shared Types Package (packages/shared-types)**

All TypeScript interfaces used across services are defined here. No service may define its own types for cross-service data structures.

## **4.1 Job Types**

| typescript |
| :---- |
| // packages/shared-types/src/job.ts   export type Platform \= 'tiktok' | 'reels' | 'shorts' | 'generic'; export type MusicMood \= 'energetic' | 'chill' | 'nostalgic' | 'cinematic' | 'none'; export type CaptionStyle \= 'bold\_white\_shadow' | 'minimal' | 'none'; export type TransitionType \= 'cut' | 'fade' | 'dissolve'; export type JobStatus \= 'queued' | 'sampling' | 'reasoning' | 'rendering' | 'uploading' | 'complete' | 'failed';   export interface RenderJobInput {   jobId: string;                    // UUID v4   userId: string;   userPrompt: string;               // Raw user text, max 500 chars   platform: Platform;   clipUrls: string\[\];               // Blob storage URLs, 1–12 clips   musicMood: MusicMood;   captionStyle: CaptionStyle;   createdAt: string;                // ISO 8601 }   export interface JobStatusRecord {   jobId: string;   userId: string;   status: JobStatus;   progress: number;                 // 0–100   outputUrl?: string;               // Populated on complete   errorMessage?: string;   createdAt: string;   updatedAt: string; } |

## **4.2 Edit Manifest Types**

This is the schema the Claude API must return. The orchestrator validates every response against this schema before passing to the render worker.

| typescript |
| :---- |
| // packages/shared-types/src/manifest.ts   export interface ClipInstruction {   id: string;             // Must match a clipUrl index: 'clip\_00', 'clip\_01', etc.   startSec: number;       // Trim start within the source clip   endSec: number;         // Trim end within the source clip   transition: TransitionType;   speed: number;          // 0.5–2.0, default 1.0 }   export interface TitleCard {   text: string;           // Max 60 chars   startSec: number;   durationSec: number;   position: 'top' | 'center' | 'bottom'; }   export interface CaptionEntry {   text: string;   startSec: number;   endSec: number; }   export interface EditManifest {   schemaVersion: '1.0';   targetDurationSec: number;        // Max 90   aspectRatio: '9:16' | '16:9' | '1:1';   musicMood: MusicMood;   captionStyle: CaptionStyle;   audioDuckOnSpeech: boolean;   clips: ClipInstruction\[\];          // Ordered — render in sequence   titleCards: TitleCard\[\];   captions: CaptionEntry\[\];          // Auto-generated or AI-specified } |

## **4.3 Queue Job Payloads**

| typescript |
| :---- |
| // packages/shared-types/src/queue.ts   export interface OrchestratorJobPayload {   jobId: string;   renderJobInput: RenderJobInput; }   export interface RenderJobPayload {   jobId: string;   manifest: EditManifest;   clipUrls: string\[\];         // Signed blob URLs, valid 2 hours   outputBlobPath: string;     // Where to upload finished MP4 } |

# **5\. Environment Configuration**

| ✅ REQUIRED All secrets are loaded from environment variables. No secrets are hardcoded. No .env files are committed. Provide .env.example with all keys and placeholder values. |
| :---- |

| env |
| :---- |
| \# .env.example — copy to .env and fill in values   \# ── Redis (BullMQ) ─────────────────────────────── REDIS\_HOST=localhost REDIS\_PORT=6379 REDIS\_PASSWORD=   \# ── Azure Blob Storage ─────────────────────────── AZURE\_STORAGE\_ACCOUNT\_NAME= AZURE\_STORAGE\_ACCOUNT\_KEY= AZURE\_STORAGE\_INPUT\_CONTAINER=clipdirector-input AZURE\_STORAGE\_OUTPUT\_CONTAINER=clipdirector-output   \# ── Claude API ─────────────────────────────────── ANTHROPIC\_API\_KEY= ANTHROPIC\_MODEL=claude-sonnet-4-20250514 ANTHROPIC\_MAX\_TOKENS=2000   \# ── OpenAI (Whisper fallback) ──────────────────── OPENAI\_API\_KEY=   \# ── Render Worker ──────────────────────────────── FFMPEG\_PATH=/usr/bin/ffmpeg FFPROBE\_PATH=/usr/bin/ffprobe RENDER\_TEMP\_DIR=/tmp/clipdirector MUSIC\_LIBRARY\_PATH=/opt/clipdirector/music   \# ── API Gateway ────────────────────────────────── API\_PORT=3000 JWT\_SECRET= MAX\_CLIPS\_PER\_JOB=12 MAX\_RAW\_FOOTAGE\_MINUTES=5 MAX\_PROMPT\_LENGTH=500   \# ── Job TTLs ───────────────────────────────────── INPUT\_BLOB\_TTL\_HOURS=2 OUTPUT\_BLOB\_TTL\_DAYS=7 JOB\_STATUS\_TTL\_DAYS=7 |

## **5.1 Env Validation**

Create a shared env validation module using zod. All services must call validateEnv() on startup and throw if any required variable is missing or malformed.

| typescript |
| :---- |
| // packages/shared-types/src/env.ts import { z } from 'zod';   export const baseEnvSchema \= z.object({   REDIS\_HOST: z.string(),   REDIS\_PORT: z.coerce.number().default(6379),   AZURE\_STORAGE\_ACCOUNT\_NAME: z.string(),   AZURE\_STORAGE\_ACCOUNT\_KEY: z.string(), });   export const orchestratorEnvSchema \= baseEnvSchema.extend({   ANTHROPIC\_API\_KEY: z.string().startsWith('sk-ant-'),   ANTHROPIC\_MODEL: z.string().default('claude-sonnet-4-20250514'),   ANTHROPIC\_MAX\_TOKENS: z.coerce.number().default(2000), });   export const renderWorkerEnvSchema \= baseEnvSchema.extend({   FFMPEG\_PATH: z.string().default('/usr/bin/ffmpeg'),   FFPROBE\_PATH: z.string().default('/usr/bin/ffprobe'),   RENDER\_TEMP\_DIR: z.string().default('/tmp/clipdirector'),   MUSIC\_LIBRARY\_PATH: z.string(), }); |

# **6\. API Gateway Service (apps/api-gateway)**

## **6.1 Dependencies**

| json |
| :---- |
| // apps/api-gateway/package.json dependencies {   "express": "^4.19",   "@types/express": "^4.17",   "multer": "^1.4",              // multipart file upload   "jsonwebtoken": "^9.0",   "zod": "^3.23",   "uuid": "^9.0",   "@clipdirector/shared-types": "workspace:\*",   "@clipdirector/queue-client": "workspace:\*",   "@clipdirector/storage-client": "workspace:\*",   "@clipdirector/logger": "workspace:\*" } |

## **6.2 Endpoints**

| Method | Path | Description | Auth |
| :---- | :---- | :---- | :---- |
| POST | /jobs | Submit a new render job. Accepts multipart/form-data with clips \+ JSON body. | JWT Bearer |
| GET | /jobs/:jobId | Poll job status. Returns JobStatusRecord. | JWT Bearer |
| GET | /jobs/:jobId/download | Returns signed blob URL for completed video. Expires in 1 hour. | JWT Bearer |
| GET | /health | Health check. Returns 200 with service status and Redis connectivity. | None |
| POST | /auth/token | Exchange userId \+ secret for JWT. Simple for now — replace with proper auth in Phase 2\. | None |

## **6.3 POST /jobs Implementation**

| ✅ REQUIRED Validate all inputs with zod before touching storage or queue. Return 400 with field-level errors on validation failure. |
| :---- |

| typescript |
| :---- |
| // apps/api-gateway/src/routes/jobs.ts   // Request validation schema const submitJobSchema \= z.object({   userPrompt: z.string().min(1).max(500),   platform: z.enum(\['tiktok', 'reels', 'shorts', 'generic'\]),   musicMood: z.enum(\['energetic', 'chill', 'nostalgic', 'cinematic', 'none'\]),   captionStyle: z.enum(\['bold\_white\_shadow', 'minimal', 'none'\]), });   // POST /jobs handler — pseudocode with required steps async function submitJob(req, res) {   // 1\. Parse and validate JSON fields from multipart body   const fields \= submitJobSchema.safeParse(JSON.parse(req.body.json));   if (\!fields.success) return res.status(400).json({ errors: fields.error.issues });     // 2\. Validate clip files: 1–12 files, each must be video/\* MIME type   const clips \= req.files;   if (\!clips || clips.length \< 1 || clips.length \> 12\)     return res.status(400).json({ error: 'Must provide 1–12 video clips' });     // 3\. Generate jobId (UUID v4)   const jobId \= uuidv4();     // 4\. Upload each clip to Azure Blob Storage   //    Path: input/{userId}/{jobId}/clip\_{index:02d}.mp4   //    Set blob TTL metadata: deleteAfter \= now \+ 2 hours   const clipUrls \= await Promise.all(clips.map((clip, i) \=\>     storageClient.upload({       container: process.env.AZURE\_STORAGE\_INPUT\_CONTAINER,       path: \`input/${userId}/${jobId}/clip\_${String(i).padStart(2,'0')}.mp4\`,       data: clip.buffer,       contentType: clip.mimetype,     })   ));     // 5\. Create initial JobStatusRecord in Redis (HSET)   //    Key: job:{jobId}   TTL: 7 days   await setJobStatus({ jobId, userId, status: 'queued', progress: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });     // 6\. Enqueue orchestrator job   await orchestratorQueue.add('process-job', {     jobId,     renderJobInput: { jobId, userId, ...fields.data, clipUrls, createdAt: new Date().toISOString() }   } satisfies OrchestratorJobPayload, {     attempts: 3,     backoff: { type: 'exponential', delay: 5000 }   });     // 7\. Return 202 Accepted   return res.status(202).json({ jobId, status: 'queued' }); } |

# **7\. Orchestrator Service (apps/orchestrator)**

The orchestrator is the brain of the pipeline. It picks up jobs from the queue, performs pre-processing, calls the Claude API, validates the manifest, and dispatches to the render worker.

## **7.1 Orchestrator Worker Loop**

| typescript |
| :---- |
| // apps/orchestrator/src/worker.ts   const orchestratorWorker \= new Worker\<OrchestratorJobPayload\>(   'orchestrator-queue',   async (job) \=\> {     const { jobId, renderJobInput } \= job.data;       try {       // Step 1: Update status → 'sampling'       await updateJobStatus(jobId, { status: 'sampling', progress: 10 });         // Step 2: Download clips from blob storage to temp dir       const localClipPaths \= await downloadClips(renderJobInput.clipUrls, jobId);         // Step 3: Sample frames from each clip (1 frame per 3 seconds)       const frameSamples \= await sampleFrames(localClipPaths);         // Step 4: Detect speech — run ffprobe on each clip       //          If speech detected, run self-hosted Whisper for transcript       const transcripts \= await transcribeClips(localClipPaths);         // Step 5: Update status → 'reasoning'       await updateJobStatus(jobId, { status: 'reasoning', progress: 30 });         // Step 6: Call Claude API with constructed director brief       const manifest \= await callClaudeReasoning({         renderJobInput,         frameSamples,         transcripts,         clipCount: localClipPaths.length,       });         // Step 7: Validate manifest against EditManifest schema       validateManifest(manifest);  // throws ManifestValidationError if invalid         // Step 8: Update status → 'rendering'       await updateJobStatus(jobId, { status: 'rendering', progress: 45 });         // Step 9: Enqueue render job       await renderQueue.add('render-job', {         jobId,         manifest,         clipUrls: renderJobInput.clipUrls,         outputBlobPath: \`output/${renderJobInput.userId}/${jobId}/output.mp4\`       } satisfies RenderJobPayload, {         attempts: 2,         backoff: { type: 'fixed', delay: 10000 }       });         // Step 10: Clean up temp files       await cleanupTempDir(jobId);       } catch (err) {       await updateJobStatus(jobId, { status: 'failed', errorMessage: err.message });       throw err;  // BullMQ handles retry based on Worker attempts config     }   },   { connection: redisConnection, concurrency: 4 } ); |

## **7.2 Frame Sampling**

| ✅ REQUIRED Frame sampling must happen before calling Claude API. Never send raw video bytes to the API. Only send base64-encoded JPEG thumbnails at maximum 512px width. |
| :---- |

| typescript |
| :---- |
| // apps/orchestrator/src/frame-sampler.ts   // Use ffmpeg to extract 1 frame per 3 seconds from each clip // Output: JPEG at max 512px wide, quality 75 // Returns: base64-encoded strings for Claude API image blocks   async function sampleFrames(clipPaths: string\[\]): Promise\<FrameSample\[\]\> {   const samples: FrameSample\[\] \= \[\];     for (const \[index, clipPath\] of clipPaths.entries()) {     // Get clip duration via ffprobe     const duration \= await getClipDuration(clipPath);       // Sample at 0s, 3s, 6s, ... up to duration     const timestamps \= Array.from(       { length: Math.ceil(duration / 3\) },       (\_, i) \=\> Math.min(i \* 3, duration \- 0.1)     );       for (const ts of timestamps) {       const jpegBuffer \= await extractFrame(clipPath, ts, 512);       samples.push({         clipId: \`clip\_${String(index).padStart(2, '0')}\`,         clipIndex: index,         timestampSec: ts,         durationSec: duration,         base64Jpeg: jpegBuffer.toString('base64'),       });     }   }     return samples; }   // FFmpeg command for single frame extraction: // ffmpeg \-ss {ts} \-i {input} \-vframes 1 \-vf scale=512:-1 \-f image2 \-q:v 5 pipe:1 |

## **7.3 Claude API Integration**

| ✅ REQUIRED Use the Anthropic SDK (@anthropic-ai/sdk). The system prompt and user message construction is exact — do not modify the JSON schema instruction or the response parsing logic. |
| :---- |

| typescript |
| :---- |
| // apps/orchestrator/src/claude-client.ts import Anthropic from '@anthropic-ai/sdk';   const client \= new Anthropic({ apiKey: process.env.ANTHROPIC\_API\_KEY });   const SYSTEM\_PROMPT \= \` You are a professional video editor AI. Your job is to analyze video clips and a user's creative brief, then produce a structured edit manifest in JSON format.   RULES: \- Return ONLY valid JSON. No markdown, no explanation, no preamble. \- The JSON must exactly match the EditManifest schema provided. \- Clip IDs must match the provided clip index format: clip\_00, clip\_01, etc. \- startSec and endSec must be within the clip's actual duration. \- Total assembled duration must not exceed targetDurationSec. \- schemaVersion must always be "1.0". \`.trim();   async function callClaudeReasoning(params: ReasoningParams): Promise\<EditManifest\> {   const { renderJobInput, frameSamples, transcripts, clipCount } \= params;     // Build image content blocks — one per sampled frame   const imageBlocks \= frameSamples.map(sample \=\> ({     type: 'image' as const,     source: {       type: 'base64' as const,       media\_type: 'image/jpeg' as const,       data: sample.base64Jpeg,     }   }));     // Build clip metadata summary   const clipMeta \= Array.from({ length: clipCount }, (\_, i) \=\> {     const id \= \`clip\_${String(i).padStart(2, '0')}\`;     const frames \= frameSamples.filter(f \=\> f.clipId \=== id);     const duration \= frames\[frames.length \- 1\]?.durationSec ?? 0;     const transcript \= transcripts\[i\] ?? '';     return \`${id}: duration=${duration.toFixed(1)}s${transcript ? ', speech="' \+ transcript.slice(0, 100\) \+ '..."' : ''}\`;   }).join('\\n');     const userMessage \= \[     ...imageBlocks,     {       type: 'text' as const,       text: \[         \`USER BRIEF: "${renderJobInput.userPrompt}"\`,         \`TARGET PLATFORM: ${renderJobInput.platform}\`,         \`MUSIC MOOD: ${renderJobInput.musicMood}\`,         \`CAPTION STYLE: ${renderJobInput.captionStyle}\`,         \`CLIP INVENTORY:\`,         clipMeta,         \`\`,         \`EDIT MANIFEST SCHEMA (you must return exactly this shape):\`,         JSON.stringify(EDIT\_MANIFEST\_SCHEMA\_EXAMPLE, null, 2),       \].join('\\n')     }   \];     const response \= await client.messages.create({     model: process.env.ANTHROPIC\_MODEL ?? 'claude-sonnet-4-20250514',     max\_tokens: Number(process.env.ANTHROPIC\_MAX\_TOKENS ?? 2000),     system: SYSTEM\_PROMPT,     messages: \[{ role: 'user', content: userMessage }\],   });     // Extract text from response   const textBlock \= response.content.find(b \=\> b.type \=== 'text');   if (\!textBlock || textBlock.type \!== 'text')     throw new Error('Claude returned no text content');     // Parse JSON — strip any accidental markdown fences   const cleaned \= textBlock.text.replace(/\`\`\`json|\`\`\`/g, '').trim();   return JSON.parse(cleaned) as EditManifest; } |

## **7.4 Manifest Validation**

After Claude returns the manifest, validate it with zod before dispatching to render. If validation fails, retry the Claude call once with the validation errors appended to the prompt. If the second call also fails validation, mark job as failed.

| typescript |
| :---- |
| // apps/orchestrator/src/manifest-validator.ts import { z } from 'zod';   const clipInstructionSchema \= z.object({   id: z.string().regex(/^clip\_\\d{2}$/),   startSec: z.number().min(0),   endSec: z.number().positive(),   transition: z.enum(\['cut', 'fade', 'dissolve'\]),   speed: z.number().min(0.5).max(2.0), }).refine(c \=\> c.endSec \> c.startSec, {   message: 'endSec must be greater than startSec' });   const editManifestSchema \= z.object({   schemaVersion: z.literal('1.0'),   targetDurationSec: z.number().min(5).max(90),   aspectRatio: z.enum(\['9:16', '16:9', '1:1'\]),   musicMood: z.enum(\['energetic', 'chill', 'nostalgic', 'cinematic', 'none'\]),   captionStyle: z.enum(\['bold\_white\_shadow', 'minimal', 'none'\]),   audioDuckOnSpeech: z.boolean(),   clips: z.array(clipInstructionSchema).min(1).max(12),   titleCards: z.array(z.object({     text: z.string().max(60),     startSec: z.number().min(0),     durationSec: z.number().min(1).max(5),     position: z.enum(\['top', 'center', 'bottom'\]),   })),   captions: z.array(z.object({     text: z.string().max(200),     startSec: z.number().min(0),     endSec: z.number().positive(),   })), });   export function validateManifest(raw: unknown): EditManifest {   const result \= editManifestSchema.safeParse(raw);   if (\!result.success) {     throw new ManifestValidationError(       'Invalid manifest from Claude',       result.error.issues     );   }   return result.data as EditManifest; } |

# **8\. Render Worker Service (apps/render-worker)**

The render worker is a pure execution engine. It receives a validated EditManifest and a set of clip URLs, executes the FFmpeg pipeline, and uploads the finished MP4.

## **8.1 Render Worker Dependencies**

| json |
| :---- |
| // apps/render-worker/package.json dependencies {   "fluent-ffmpeg": "^2.1",      // FFmpeg Node.js wrapper   "@types/fluent-ffmpeg": "^2.1",   "@clipdirector/shared-types": "workspace:\*",   "@clipdirector/queue-client": "workspace:\*",   "@clipdirector/storage-client": "workspace:\*",   "@clipdirector/logger": "workspace:\*",   "zod": "^3.23" } |

## **8.2 FFmpeg Pipeline — Exact Processing Order**

| ✅ REQUIRED Execute FFmpeg steps in this exact order. Do not reorder. Each step produces an intermediate file that the next step consumes. |
| :---- |

| Step | Operation | FFmpeg Approach | Output |
| :---- | :---- | :---- | :---- |
| 1 | Clip extraction: trim each clip to startSec/endSec | ffmpeg \-ss {start} \-to {end} \-i {input} \-c copy {output} | temp/clips/{jobId}/segment\_{n}.mp4 per clip |
| 2 | Speed adjustment (if speed \!= 1.0) | setpts={1/speed}\*PTS video filter \+ atempo={speed} audio filter | temp/clips/{jobId}/segment\_{n}\_speed.mp4 |
| 3 | Scale and pad to target aspect ratio | scale=1080:1920:force\_original\_aspect\_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2 for 9:16 | temp/clips/{jobId}/segment\_{n}\_scaled.mp4 |
| 4 | Concatenate all segments | concat demuxer with input.txt file list | temp/{jobId}/concat.mp4 |
| 5 | Apply xfade transitions between clips | xfade filter with offset calculated from clip end points | temp/{jobId}/transitions.mp4 |
| 6 | Mix music track | amix with volume adjustment; sidechaincompress for ducking on speech segments | temp/{jobId}/with\_music.mp4 |
| 7 | Overlay title cards | drawtext filter: fontfile, fontsize, fontcolor=white, box=1, boxcolor=black@0.5 | temp/{jobId}/with\_titles.mp4 |
| 8 | Overlay captions (if style \!= none) | subtitles or drawtext filter per CaptionEntry, style applied per captionStyle field | temp/{jobId}/with\_captions.mp4 |
| 9 | Final encode | libx264, crf=23, preset=fast, aac audio 192k, movflags=+faststart | temp/{jobId}/output.mp4 |
| 10 | Upload to blob storage | Stream output.mp4 to Azure Blob at outputBlobPath | Signed URL returned |

## **8.3 Render Worker Implementation**

| typescript |
| :---- |
| // apps/render-worker/src/worker.ts   const renderWorker \= new Worker\<RenderJobPayload\>(   'render-queue',   async (job) \=\> {     const { jobId, manifest, clipUrls, outputBlobPath } \= job.data;     const tempDir \= path.join(process.env.RENDER\_TEMP\_DIR, jobId);     await fs.mkdir(tempDir, { recursive: true });       try {       await updateJobStatus(jobId, { status: 'rendering', progress: 50 });         // Step 1: Download clips to temp dir       const clipPaths \= await downloadClipsToTemp(clipUrls, tempDir);         // Steps 2–5: Trim, speed-adjust, scale, concatenate       const concatPath \= await buildConcatenation(manifest.clips, clipPaths, manifest.aspectRatio, tempDir);       await updateJobStatus(jobId, { progress: 65 });         // Step 6: Mix music       const withMusicPath \= await mixMusic(concatPath, manifest, tempDir);       await updateJobStatus(jobId, { progress: 75 });         // Steps 7–8: Titles and captions       const withTextPath \= await overlayText(withMusicPath, manifest, tempDir);       await updateJobStatus(jobId, { progress: 85 });         // Step 9: Final encode       const outputPath \= await finalEncode(withTextPath, tempDir);       await updateJobStatus(jobId, { progress: 92 });         // Step 10: Upload       await updateJobStatus(jobId, { status: 'uploading', progress: 95 });       const outputUrl \= await storageClient.upload({         container: process.env.AZURE\_STORAGE\_OUTPUT\_CONTAINER,         path: outputBlobPath,         filePath: outputPath,         contentType: 'video/mp4',       });         await updateJobStatus(jobId, { status: 'complete', progress: 100, outputUrl });       } finally {       // Always clean up temp files       await fs.rm(tempDir, { recursive: true, force: true });     }   },   { connection: redisConnection, concurrency: 2 } );   // concurrency: 2 — conservative for a 4-core VM running FFmpeg // Increase only after benchmarking actual CPU utilization |

## **8.4 Music Selection**

Phase 1 uses a local royalty-free music library. Files are organized by mood tag in the MUSIC\_LIBRARY\_PATH directory:

| directory |
| :---- |
| // Music library directory structure ${MUSIC\_LIBRARY\_PATH}/ ├── energetic/ │   ├── track\_001.mp3 │   └── track\_002.mp3 ├── chill/ ├── nostalgic/ ├── cinematic/ └── metadata.json    // { filename, durationSec, bpm, key, license } |

| typescript |
| :---- |
| // apps/render-worker/src/music-selector.ts   // Selection logic: // 1\. Read mood directory // 2\. Filter tracks where durationSec \>= manifest.targetDurationSec // 3\. Select randomly (seed with jobId for reproducibility) // 4\. If no track long enough, loop shortest track   // Audio mixing command (applied in Step 6): // ffmpeg \-i concat.mp4 \-i music.mp3 //   \-filter\_complex //     '\[1:a\]volume=0.3\[music\]; //      \[0:a\]\[music\]amix=inputs=2:duration=first\[aout\]' //   \-map 0:v \-map '\[aout\]' //   \-shortest with\_music.mp4 |

# **9\. Queue Client Package (packages/queue-client)**

Wraps BullMQ with typed queue names, typed job payloads, and shared connection config. All services import queue instances from this package — never instantiate BullMQ directly.

| typescript |
| :---- |
| // packages/queue-client/src/index.ts import { Queue, Worker, QueueEvents } from 'bullmq'; import type { OrchestratorJobPayload, RenderJobPayload } from '@clipdirector/shared-types';   export const QUEUE\_NAMES \= {   ORCHESTRATOR: 'orchestrator-queue',   RENDER: 'render-queue',   DEAD\_LETTER: 'dead-letter-queue', } as const;   // Redis connection — shared across all queue instances export const getRedisConnection \= () \=\> ({   host: process.env.REDIS\_HOST ?? 'localhost',   port: Number(process.env.REDIS\_PORT ?? 6379),   password: process.env.REDIS\_PASSWORD || undefined,   maxRetriesPerRequest: null,  // Required by BullMQ });   // Typed queue factories export const createOrchestratorQueue \= () \=\>   new Queue\<OrchestratorJobPayload\>(QUEUE\_NAMES.ORCHESTRATOR, {     connection: getRedisConnection(),     defaultJobOptions: {       attempts: 3,       backoff: { type: 'exponential', delay: 5000 },       removeOnComplete: { count: 100 },       removeOnFail: false,  // Keep failed jobs for inspection     }   });   export const createRenderQueue \= () \=\>   new Queue\<RenderJobPayload\>(QUEUE\_NAMES.RENDER, {     connection: getRedisConnection(),     defaultJobOptions: {       attempts: 2,       backoff: { type: 'fixed', delay: 10000 },       removeOnComplete: { count: 50 },       removeOnFail: false,     }   });   // Job status persistence (Redis HSET, not BullMQ job data) // Key pattern: job:{jobId} // TTL: 7 days export async function setJobStatus(redis: Redis, record: JobStatusRecord): Promise\<void\> {   const key \= \`job:${record.jobId}\`;   await redis.hset(key, { ...record, updatedAt: new Date().toISOString() });   await redis.expire(key, 60 \* 60 \* 24 \* 7); }   export async function getJobStatus(redis: Redis, jobId: string): Promise\<JobStatusRecord | null\> {   const data \= await redis.hgetall(\`job:${jobId}\`);   if (\!data || \!data.jobId) return null;   return data as JobStatusRecord; } |

# **10\. Storage Client Package (packages/storage-client)**

Abstracts Azure Blob Storage. All blob operations go through this package. Uses the @azure/storage-blob SDK.

| typescript |
| :---- |
| // packages/storage-client/src/index.ts import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';   export interface UploadOptions {   container: string;   path: string;         // Blob path within container   data?: Buffer;        // Use data OR filePath   filePath?: string;   contentType: string; }   export class StorageClient {   private client: BlobServiceClient;     constructor() {     const credential \= new StorageSharedKeyCredential(       process.env.AZURE\_STORAGE\_ACCOUNT\_NAME\!,       process.env.AZURE\_STORAGE\_ACCOUNT\_KEY\!     );     this.client \= new BlobServiceClient(       \`https://${process.env.AZURE\_STORAGE\_ACCOUNT\_NAME}.blob.core.windows.net\`,       credential     );   }     // Upload — returns public URL (or signed URL for output container)   async upload(opts: UploadOptions): Promise\<string\> { ... }     // Download to local file path   async download(blobUrl: string, localPath: string): Promise\<void\> { ... }     // Generate SAS URL valid for {expiryHours} hours   async getSignedUrl(container: string, path: string, expiryHours: number): Promise\<string\> { ... }     // Delete blob (used for temp cleanup)   async delete(container: string, path: string): Promise\<void\> { ... } }   // Export singleton export const storageClient \= new StorageClient(); |

# **11\. Error Handling and Retry Strategy**

## **11.1 Error Classification**

| Error Type | Class | Retry? | Behavior |
| :---- | :---- | :---- | :---- |
| Claude API timeout / 529 | TransientError | Yes — 3x exponential | Retry with same payload. Log timeout duration. |
| Claude returns invalid JSON | ManifestParseError | Yes — 1x | Retry once with error appended to prompt. Fail on second failure. |
| Manifest fails zod validation | ManifestValidationError | Yes — 1x | Retry with validation errors in prompt. Fail on second failure. |
| FFmpeg non-zero exit | RenderError | Yes — 2x fixed 10s | Log stderr. Retry with same manifest. Fail after 2nd attempt. |
| Azure Blob upload failure | StorageError | Yes — 3x exponential | Standard retry. Alert if all 3 fail. |
| Missing clip / 404 on download | InputError | No | Fail immediately. User must resubmit. |
| Clip exceeds duration limit | ValidationError | No | Fail immediately with user-readable message. |
| Redis connection lost | InfrastructureError | Automatic | BullMQ handles reconnection. Worker pauses until Redis recovers. |

## **11.2 Dead Letter Queue**

After all retry attempts are exhausted, BullMQ moves the job to the failed set. A separate Dead Letter processor runs every 10 minutes:

* Logs full job payload and error chain to structured logger

* Updates JobStatusRecord to 'failed' with errorMessage

* Purges failed jobs older than 48 hours from BullMQ failed set (keep Redis clean)

* Phase 2: send alert to admin webhook on failure

## **11.3 Timeout Budgets**

| Operation | Timeout | Note |
| :---- | :---- | :---- |
| Single clip download (temp) | 60 seconds | Per clip. Fail fast if blob is unreachable. |
| Frame sampling (all clips) | 120 seconds | Total budget. FFmpeg is fast; fail if hung. |
| Whisper transcription | 180 seconds | Per job. Self-hosted — monitor for overload. |
| Claude API call | 60 seconds | SDK-level timeout. Retry on timeout. |
| Manifest validation | 5 seconds | Zod is synchronous — should never approach limit. |
| Full FFmpeg render | 300 seconds | 5 minutes max. Alert \+ fail if exceeded. |
| Output upload | 120 seconds | Depends on output file size and Azure connection. |
| Total job end-to-end | 600 seconds | Hard outer timeout. Mark as failed if exceeded. |

# **12\. Docker and Local Development**

## **12.1 Dockerfiles**

One Dockerfile per service. All use multi-stage builds: build stage (node:20-alpine) and runtime stage (node:20-alpine for API/orchestrator, ubuntu:24.04 for render-worker to support FFmpeg).

| dockerfile |
| :---- |
| \# infra/docker/render-worker.Dockerfile \# Stage 1: Build FROM node:20-alpine AS builder WORKDIR /app COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./ COPY packages/ packages/ COPY apps/render-worker/ apps/render-worker/ RUN corepack enable && pnpm install \--frozen-lockfile RUN pnpm \--filter render-worker build   \# Stage 2: Runtime (Ubuntu for FFmpeg) FROM ubuntu:24.04 AS runtime RUN apt-get update && apt-get install \-y \\     ffmpeg \\     nodejs \\     && rm \-rf /var/lib/apt/lists/\* WORKDIR /app COPY \--from=builder /app/apps/render-worker/dist ./dist COPY \--from=builder /app/node\_modules ./node\_modules ENV FFMPEG\_PATH=/usr/bin/ffmpeg ENV FFPROBE\_PATH=/usr/bin/ffprobe ENV RENDER\_TEMP\_DIR=/tmp/clipdirector CMD \["node", "dist/index.js"\] |

## **12.2 docker-compose (Local Dev)**

| yaml |
| :---- |
| \# infra/compose/docker-compose.yml version: '3.9' services:   redis:     image: redis:7-alpine     ports: \['6379:6379'\]     volumes: \['redis-data:/data'\]     azurite:     image: mcr.microsoft.com/azure-storage/azurite     ports: \['10000:10000'\]   \# Blob service     command: azurite-blob \--blobHost 0.0.0.0     \# Use as Azure Blob Storage emulator in local dev     \# Set AZURE\_STORAGE\_ACCOUNT\_NAME=devstoreaccount1     api-gateway:     build: { context: ../.., dockerfile: infra/docker/api-gateway.Dockerfile }     ports: \['3000:3000'\]     env\_file: ../../.env     depends\_on: \[redis, azurite\]     orchestrator:     build: { context: ../.., dockerfile: infra/docker/orchestrator.Dockerfile }     env\_file: ../../.env     depends\_on: \[redis, azurite\]     render-worker:     build: { context: ../.., dockerfile: infra/docker/render-worker.Dockerfile }     env\_file: ../../.env     volumes:       \- /tmp/clipdirector:/tmp/clipdirector       \- ./music:/opt/clipdirector/music:ro     depends\_on: \[redis, azurite\]   volumes:   redis-data: |

| ℹ NOTE Use Azurite (Microsoft's Azure Storage emulator) for local development. Set connection string to the Azurite default in local .env. Never use real Azure credentials in docker-compose. |
| :---- |

# **13\. Testing Strategy**

## **13.1 Test Stack**

* Unit tests: Vitest

* Integration tests: Vitest \+ testcontainers (spins real Redis and Azurite in Docker)

* E2E tests: Vitest \+ docker-compose test stack

* Coverage target: 80% line coverage on orchestrator and render-worker

## **13.2 Critical Test Cases**

| Test ID | Description | Type |
| :---- | :---- | :---- |
| T-01 | POST /jobs with valid 3-clip upload returns 202 and jobId | Integration |
| T-02 | POST /jobs with 13 clips returns 400 with error message | Unit |
| T-03 | POST /jobs with non-video file MIME type returns 400 | Unit |
| T-04 | Orchestrator picks up queued job and calls Claude API | Integration |
| T-05 | Claude response with valid JSON passes manifest validation | Unit |
| T-06 | Claude response with invalid JSON triggers single retry with error context | Unit |
| T-07 | Manifest with clip endSec \<= startSec fails zod validation | Unit |
| T-08 | Render worker produces valid MP4 from test manifest \+ sample clips | Integration |
| T-09 | Render worker cleans up all temp files after success | Integration |
| T-10 | Render worker cleans up all temp files after failure | Integration |
| T-11 | GET /jobs/:jobId returns correct status at each pipeline stage | Integration |
| T-12 | Full pipeline: POST /jobs to complete status and downloadable MP4 | E2E |
| T-13 | Job with Claude API timeout retries 3 times then marks failed | Integration |
| T-14 | Job with FFmpeg error retries 2 times then marks failed | Integration |
| T-15 | Completed job output blob is accessible via signed URL | Integration |

# **14\. Health Checks and Observability**

## **14.1 Health Endpoints**

Each service exposes GET /health. The API gateway aggregates:

| json |
| :---- |
| // GET /health response shape {   "status": "ok" | "degraded" | "unhealthy",   "version": "1.0.0",   "checks": {     "redis": { "status": "ok", "latencyMs": 2 },     "azureBlob": { "status": "ok" },     "orchestratorQueue": { "waiting": 3, "active": 1 },     "renderQueue": { "waiting": 1, "active": 1 }   } } |

## **14.2 Structured Logging**

Use the shared logger package (Pino). Every log entry must include:

| json |
| :---- |
| // Required fields on every log entry {   "level": "info" | "warn" | "error",   "timestamp": "2026-05-16T14:23:01.456Z",   "service": "orchestrator" | "render-worker" | "api-gateway",   "jobId": "uuid-if-applicable",   "msg": "Human readable message",   // ...additional context fields }   // Key events to log (minimum): // \- Job received by API gateway (info) // \- Clip upload complete (info) // \- Orchestrator job started (info) // \- Frame sampling complete (info, include frame count and duration) // \- Claude API called (info, include token estimate) // \- Claude API response received (info, include response time ms) // \- Manifest validation passed (info) // \- Manifest validation failed (warn, include zod issues) // \- Render started (info) // \- Render complete (info, include output size bytes, render duration ms) // \- Job failed (error, include full error stack and retry count) |

# **15\. Android Client Scaffold (apps/android)**

| ⚠ WARNING Full Android implementation is Phase 2\. In Phase 0, scaffold the project structure only. Do not implement business logic — create placeholder screens with TODO comments. |
| :---- |

## **15.1 Project Setup**

* Language: Kotlin

* UI: Jetpack Compose

* Min SDK: API 29 (Android 10\)

* Build: Gradle with Kotlin DSL

* HTTP: Retrofit 2 \+ OkHttp

* Video player: ExoPlayer (Media3)

* Image loading: Coil

## **15.2 Screen Inventory (Scaffold Only)**

| Screen | File | Purpose |
| :---- | :---- | :---- |
| ClipSelectScreen | ui/clips/ClipSelectScreen.kt | Multi-select from MediaStore. Max 12 clips. |
| PromptScreen | ui/prompt/PromptScreen.kt | Text prompt, platform selector, music mood, caption style. |
| ProcessingScreen | ui/processing/ProcessingScreen.kt | Progress polling. Shows status \+ estimated time. |
| PreviewScreen | ui/preview/PreviewScreen.kt | ExoPlayer full-screen preview \+ share/download actions. |
| HistoryScreen | ui/history/HistoryScreen.kt | List of past jobs with status. Tap to preview or re-prompt. |

## **15.3 API Client Interface**

| kotlin |
| :---- |
| // apps/android/src/main/kotlin/ai/clipdirector/api/ClipDirectorApi.kt // Scaffold only — implement in Phase 2   interface ClipDirectorApi {     @Multipart     @POST("jobs")     suspend fun submitJob(         @Part clips: List\<MultipartBody.Part\>,         @Part("json") body: RequestBody     ): SubmitJobResponse       @GET("jobs/{jobId}")     suspend fun getJobStatus(         @Path("jobId") jobId: String     ): JobStatusResponse       @GET("jobs/{jobId}/download")     suspend fun getDownloadUrl(         @Path("jobId") jobId: String     ): DownloadUrlResponse } |

# **16\. Implementation Checklist for Claude Code**

| ✅ REQUIRED Work through this checklist in order. Check off each item before moving to the next. Do not batch multiple phases into one generation pass. |
| :---- |

### **Phase 0 — Monorepo Foundation**

1. Initialize pnpm workspace with pnpm-workspace.yaml

2. Create tsconfig.base.json with strict mode

3. Scaffold all package directories with empty package.json and tsconfig.json

4. Create packages/logger (Pino wrapper, singleton, typed log levels)

5. Create packages/shared-types with all interfaces from Section 4

6. Add zod schemas for env validation (Section 5.1)

7. Create .env.example with all variables from Section 5

8. Verify: pnpm build passes with zero TypeScript errors

### **Phase 1 — Queue and Storage Clients**

9. Implement packages/queue-client per Section 9

10. Implement packages/storage-client per Section 10

11. Write unit tests for queue enqueue/dequeue (T-series from Section 13.2)

12. Write unit tests for storage upload/download with Azurite

13. Verify: all Phase 1 unit tests pass

### **Phase 2 — API Gateway**

14. Scaffold apps/api-gateway with Express

15. Implement JWT auth middleware

16. Implement POST /auth/token (simple secret exchange for dev)

17. Implement POST /jobs with multer, zod validation, blob upload, queue enqueue

18. Implement GET /jobs/:jobId status polling

19. Implement GET /health

20. Write integration tests T-01, T-02, T-03, T-11

21. Verify: T-01 through T-03 and T-11 pass

### **Phase 3 — Orchestrator**

22. Scaffold apps/orchestrator BullMQ worker

23. Implement frame sampler per Section 7.2

24. Implement Whisper speech detection and transcription

25. Implement Claude API client per Section 7.3 exactly

26. Implement manifest validation per Section 7.4

27. Implement retry logic for manifest validation failures

28. Write integration tests T-04 through T-07

29. Verify: T-04 through T-07 pass

### **Phase 4 — Render Worker**

30. Scaffold apps/render-worker BullMQ worker

31. Implement FFmpeg pipeline Steps 1–9 per Section 8.2 in exact order

32. Implement music selector per Section 8.4

33. Implement temp directory cleanup (success AND failure paths)

34. Implement output blob upload and status update

35. Write integration tests T-08, T-09, T-10

36. Verify: T-08 through T-10 pass with real sample clips

### **Phase 5 — End-to-End**

37. Implement GET /jobs/:jobId/download signed URL endpoint

38. Write E2E test T-12

39. Verify: full pipeline from POST /jobs to completed MP4 URL

### **Phase 6 — Hardening**

40. Implement dead letter queue processor per Section 11.2

41. Implement all timeout budgets per Section 11.3

42. Write integration tests T-13 and T-14

43. Verify: all retry and failure paths tested

### **Phase 7 — Containers**

44. Write Dockerfiles for all three services per Section 12.1

45. Write docker-compose.yml per Section 12.2

46. Verify: docker-compose up starts all services

47. Verify: E2E test T-12 passes inside container stack

### **Android Scaffold (Phase 0 only — full impl Phase 2\)**

48. Initialize Android project in apps/android with Kotlin \+ Compose

49. Create screen scaffolds per Section 15.2 with TODO placeholders

50. Create ClipDirectorApi interface per Section 15.3

# **17\. Constraints and Non-Negotiables**

| 🚫 CRITICAL These constraints must never be violated. They are not negotiable and are not subject to interpretation. |
| :---- |

* No secrets in source code. All secrets via environment variables only.

* No custom AI model training. Use Claude API exclusively for reasoning.

* No raw video bytes sent to Claude API. Frame sampling is mandatory before any API call.

* Manifest validation (zod) must execute before every render job dispatch. Never skip.

* FFmpeg pipeline steps must execute in the order defined in Section 8.2. Do not reorder.

* Temp files must be deleted after every job, success or failure. Use try/finally.

* Input clips must be deleted from blob storage within 2 hours of render completion.

* All TypeScript must compile with strict: true and zero errors.

* All services must validate their environment variables on startup and refuse to start if any required variable is missing.

* Test coverage on orchestrator and render-worker must be \>= 80% before Phase 7\.

ClipDirector AI — Engineering Pipeline PRD v1.0 — May 2026 — For Claude Code Consumption