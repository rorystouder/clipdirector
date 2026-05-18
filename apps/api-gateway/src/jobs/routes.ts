import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type {
  OrchestratorJobPayload,
  Platform,
  CaptionStyle,
  MusicMood,
} from '@clipdirector/shared-types';
import { setJobStatus, getJobStatus } from '@clipdirector/queue-client';
import type { StorageClient } from '@clipdirector/storage-client';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors.js';
import { requireAuth } from '../auth/middleware.js';

const PLATFORMS: readonly Platform[] = ['tiktok', 'reels', 'shorts', 'generic'];
const MOODS: readonly MusicMood[] = ['energetic', 'chill', 'nostalgic', 'cinematic', 'none'];
const STYLES: readonly CaptionStyle[] = ['bold_white_shadow', 'minimal', 'none'];

export interface JobsRouterDeps {
  redis: Redis;
  orchestratorQueue: Queue<OrchestratorJobPayload>;
  storage: StorageClient;
  jwtSecret: string;
  inputBucket: string;
  outputBucket: string;
  maxClipsPerJob: number;
  maxPromptLength: number;
  maxClipBytes: number;
  signedUrlExpiryHours: number;
}

export function buildJobsRouter(deps: JobsRouterDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: deps.jwtSecret });

  const submitJobSchema = z.object({
    userPrompt: z.string().min(1).max(deps.maxPromptLength),
    platform: z.enum(PLATFORMS as [Platform, ...Platform[]]),
    musicMood: z.enum(MOODS as [MusicMood, ...MusicMood[]]),
    captionStyle: z.enum(STYLES as [CaptionStyle, ...CaptionStyle[]]),
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.maxClipBytes, files: deps.maxClipsPerJob },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('video/')) {
        return cb(new ValidationError(`Clip ${file.originalname} is not a video (got ${file.mimetype})`));
      }
      cb(null, true);
    },
  });

  router.post(
    '/',
    auth,
    upload.array('clips', deps.maxClipsPerJob),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) return next(new UnauthorizedError());
        const userId = req.user.id;

        const rawJson = typeof req.body?.json === 'string' ? req.body.json : '';
        if (!rawJson) return next(new ValidationError('Missing "json" field in multipart body'));

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawJson);
        } catch {
          return next(new ValidationError('"json" field is not valid JSON'));
        }

        const fields = submitJobSchema.safeParse(parsedJson);
        if (!fields.success) return next(new ValidationError('Invalid job fields', fields.error.issues));

        const clips = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (clips.length < 1) return next(new ValidationError('Must provide at least 1 video clip'));
        if (clips.length > deps.maxClipsPerJob) {
          return next(new ValidationError(`Must provide no more than ${deps.maxClipsPerJob} clips`));
        }

        const jobId = uuid();
        const createdAt = new Date().toISOString();

        const clipUrls = await Promise.all(
          clips.map((clip, i) => {
            const key = `input/${userId}/${jobId}/clip_${String(i).padStart(2, '0')}`;
            return deps.storage.upload({
              bucket: deps.inputBucket,
              key,
              data: clip.buffer,
              contentType: clip.mimetype,
            });
          }),
        );

        await setJobStatus(deps.redis, {
          jobId,
          userId,
          status: 'queued',
          progress: 0,
          createdAt,
          updatedAt: createdAt,
        });

        const payload: OrchestratorJobPayload = {
          jobId,
          renderJobInput: {
            jobId,
            userId,
            userPrompt: fields.data.userPrompt,
            platform: fields.data.platform,
            musicMood: fields.data.musicMood,
            captionStyle: fields.data.captionStyle,
            clipUrls,
            createdAt,
          },
        };

        await deps.orchestratorQueue.add('process-job', payload);

        return res.status(202).json({ jobId, status: 'queued' });
      } catch (err) {
        return next(err);
      }
    },
  );

  router.get('/:jobId', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new UnauthorizedError());
      const record = await getJobStatus(deps.redis, req.params.jobId ?? '');
      if (!record) return next(new NotFoundError('Job not found'));
      if (record.userId !== req.user.id) return next(new ForbiddenError('Not your job'));
      return res.status(200).json(record);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:jobId/download', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new UnauthorizedError());
      const record = await getJobStatus(deps.redis, req.params.jobId ?? '');
      if (!record) return next(new NotFoundError('Job not found'));
      if (record.userId !== req.user.id) return next(new ForbiddenError('Not your job'));
      if (record.status !== 'complete' || !record.outputUrl) {
        return next(new ValidationError('Job is not complete yet'));
      }

      const key = extractKeyFromUri(record.outputUrl, deps.outputBucket);
      const url = await deps.storage.getSignedUrl(deps.outputBucket, key, deps.signedUrlExpiryHours);
      const expiresAt = new Date(Date.now() + deps.signedUrlExpiryHours * 3600_000).toISOString();
      return res.status(200).json({ url, expiresAt });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function extractKeyFromUri(uri: string, bucket: string): string {
  const prefix = `s3://${bucket}/`;
  if (uri.startsWith(prefix)) return uri.slice(prefix.length);
  return uri;
}
