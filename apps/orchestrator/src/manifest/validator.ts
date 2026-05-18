import { z } from 'zod';
import type { EditManifest } from '@clipdirector/shared-types';
import { ManifestValidationError } from '../errors.js';

const clipInstructionSchema = z
  .object({
    id: z.string().regex(/^clip_\d{2}$/, 'id must be clip_NN format'),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    transition: z.enum(['cut', 'fade', 'dissolve']),
    speed: z.number().min(0.5).max(2.0),
  })
  .refine((c) => c.endSec > c.startSec, {
    message: 'endSec must be greater than startSec',
    path: ['endSec'],
  });

const titleCardSchema = z.object({
  text: z.string().min(1).max(60),
  startSec: z.number().min(0),
  durationSec: z.number().min(1).max(5),
  position: z.enum(['top', 'center', 'bottom']),
});

const captionEntrySchema = z
  .object({
    text: z.string().min(1).max(200),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
  })
  .refine((c) => c.endSec > c.startSec, {
    message: 'caption endSec must be greater than startSec',
    path: ['endSec'],
  });

export const editManifestSchema = z.object({
  schemaVersion: z.literal('1.0'),
  targetDurationSec: z.number().min(5).max(90),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
  musicMood: z.enum(['energetic', 'chill', 'nostalgic', 'cinematic', 'none']),
  captionStyle: z.enum(['bold_white_shadow', 'minimal', 'none']),
  audioDuckOnSpeech: z.boolean(),
  clips: z.array(clipInstructionSchema).min(1).max(12),
  titleCards: z.array(titleCardSchema),
  captions: z.array(captionEntrySchema),
});

export function validateManifest(raw: unknown): EditManifest {
  const result = editManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new ManifestValidationError(
      'Manifest failed schema validation',
      result.error.issues,
      raw,
    );
  }
  return result.data as EditManifest;
}
