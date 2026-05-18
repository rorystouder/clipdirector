export type Platform = 'tiktok' | 'reels' | 'shorts' | 'generic';
export type MusicMood = 'energetic' | 'chill' | 'nostalgic' | 'cinematic' | 'none';
export type CaptionStyle = 'bold_white_shadow' | 'minimal' | 'none';
export type TransitionType = 'cut' | 'fade' | 'dissolve';
export type JobStatus =
  | 'queued'
  | 'sampling'
  | 'reasoning'
  | 'rendering'
  | 'uploading'
  | 'complete'
  | 'failed';

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
