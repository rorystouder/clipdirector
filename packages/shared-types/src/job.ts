// Single source of truth for the wire-level enum strings shared by the
// gateway (TypeScript), the orchestrator/render-worker (TypeScript), and
// the Android client (Kotlin enums with @SerialName). Anyone adding a
// value here MUST also add the corresponding @SerialName entry in
// apps/android/app/src/main/kotlin/ai/clipdirector/data/job/JobApi.kt —
// drift will silently break Android JSON deserialization at runtime.
//
// Contract test pins the exact set: see
// apps/api-gateway/src/__tests__/api.test.ts "enum contract".

export const PLATFORMS = ['tiktok', 'reels', 'shorts', 'generic'] as const;
export const MUSIC_MOODS = ['energetic', 'chill', 'nostalgic', 'cinematic', 'none'] as const;
export const CAPTION_STYLES = ['bold_white_shadow', 'minimal', 'none'] as const;
export const TRANSITION_TYPES = ['cut', 'fade', 'dissolve'] as const;
export const JOB_STATUSES = [
  'queued',
  'sampling',
  'reasoning',
  'rendering',
  'uploading',
  'complete',
  'failed',
] as const;

export type Platform = (typeof PLATFORMS)[number];
export type MusicMood = (typeof MUSIC_MOODS)[number];
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface RenderJobInput {
  jobId: string;
  userId: string;
  userPrompt: string;
  platform: Platform;
  clipUrls: string[];
  musicMood: MusicMood;
  captionStyle: CaptionStyle;
  createdAt: string;
}

export interface JobStatusRecord {
  jobId: string;
  userId: string;
  status: JobStatus;
  progress: number;
  outputUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
