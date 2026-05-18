import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MusicMood } from '@clipdirector/shared-types';
import { MusicLibraryError } from '../errors.js';

export interface MusicSelector {
  select(mood: MusicMood, jobId: string, targetDurationSec: number): Promise<string | null>;
}

export interface FilesystemMusicSelectorConfig {
  libraryRoot: string;
}

export function createFilesystemMusicSelector(
  cfg: FilesystemMusicSelectorConfig,
): MusicSelector {
  return {
    async select(mood, jobId, _targetDurationSec) {
      if (mood === 'none') return null;
      const moodDir = path.join(cfg.libraryRoot, mood);
      let entries: string[];
      try {
        entries = await readdir(moodDir);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          throw new MusicLibraryError(`Music mood directory missing: ${moodDir}`);
        }
        throw err;
      }
      const tracks = entries.filter((f) => f.toLowerCase().endsWith('.mp3'));
      if (tracks.length === 0) {
        throw new MusicLibraryError(`No .mp3 tracks in ${moodDir}`);
      }
      const idx = deterministicIndex(jobId, tracks.length);
      return path.join(moodDir, tracks[idx]!);
    },
  };
}

function deterministicIndex(seed: string, modulus: number): number {
  const hash = createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0) % modulus;
}
