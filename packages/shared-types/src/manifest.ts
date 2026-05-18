import type { CaptionStyle, MusicMood, TransitionType } from './job.js';

export interface ClipInstruction {
  id: string;
  startSec: number;
  endSec: number;
  transition: TransitionType;
  speed: number;
}

export interface TitleCard {
  text: string;
  startSec: number;
  durationSec: number;
  position: 'top' | 'center' | 'bottom';
}

export interface CaptionEntry {
  text: string;
  startSec: number;
  endSec: number;
}

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface EditManifest {
  schemaVersion: '1.0';
  targetDurationSec: number;
  aspectRatio: AspectRatio;
  musicMood: MusicMood;
  captionStyle: CaptionStyle;
  audioDuckOnSpeech: boolean;
  clips: ClipInstruction[];
  titleCards: TitleCard[];
  captions: CaptionEntry[];
}
