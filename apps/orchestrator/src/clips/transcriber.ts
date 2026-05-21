import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { TranscriptionError } from '../errors.js';

export interface Transcriber {
  transcribeAll(clipPaths: string[]): Promise<string[]>;
}

export interface OpenAiTranscriberConfig {
  apiKey: string;
  ffmpegPath: string;
  ffprobePath: string;
  model?: string;
  /**
   * Max simultaneous Whisper requests in flight. OpenAI tolerates ~5
   * concurrent requests on free/team tiers without rate limiting.
   * Default 4 to stay below ceilings on shared API keys.
   */
  concurrency?: number;
}

export function createOpenAiTranscriber(config: OpenAiTranscriberConfig): Transcriber {
  const openai = new OpenAI({ apiKey: config.apiKey });
  const model = config.model ?? 'whisper-1';
  const concurrency = config.concurrency ?? 4;

  return {
    async transcribeAll(clipPaths: string[]): Promise<string[]> {
      // Per-job temp dir for the extracted audio. Cleaned up in a finally.
      const audioTempDir = await mkdtemp(path.join(tmpdir(), 'clipdirector-audio-'));
      try {
        // Two-phase: (1) per clip, probe-then-extract-audio in parallel
        // (CPU-bound, bandwidth saved before any network egress), then
        // (2) upload extracted audio files to Whisper with concurrency cap.
        const audioPlans = await mapLimit(clipPaths, concurrency, async (clipPath, index) => {
          const hasAudio = await probeHasAudio(config.ffprobePath, clipPath);
          if (!hasAudio) return { index, audioPath: null };
          const audioPath = path.join(audioTempDir, `clip_${index}.ogg`);
          await extractAudio(config.ffmpegPath, clipPath, audioPath);
          return { index, audioPath };
        });

        const transcripts: string[] = new Array(clipPaths.length).fill('');
        await mapLimit(audioPlans, concurrency, async (plan) => {
          if (!plan.audioPath) return;
          try {
            const response = await openai.audio.transcriptions.create({
              file: createReadStream(plan.audioPath),
              model,
            });
            transcripts[plan.index] = response.text ?? '';
          } catch (err) {
            throw new TranscriptionError(
              `Whisper failed for clip ${plan.index}: ${(err as Error).message}`,
              plan.index,
            );
          }
        });

        return transcripts;
      } finally {
        await rm(audioTempDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Extract mono 16-kHz Opus from a video container. Whisper accepts
 * .ogg/.opus directly and only needs audio. A 5-min 1080p MP4 (~50 MB)
 * shrinks to a 5-min 16k mono Opus (~3 MB) — 94% network savings on the
 * upload to OpenAI, and Whisper-side decoding is faster too.
 */
async function extractAudio(
  ffmpegPath: string,
  clipPath: string,
  outPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-y',
      '-i', clipPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'libopus',
      '-b:a', '24k',
      outPath,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => stderr.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg audio-extract exited ${code}: ${Buffer.concat(stderr).toString('utf-8').slice(-400)}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

async function probeHasAudio(ffprobePath: string, clipPath: string): Promise<boolean> {
  const args = [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=codec_type',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    clipPath,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.on('error', (err) => reject(err));
    proc.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf-8').trim();
      resolve(text.includes('audio'));
    });
  });
}

/** Bounded-concurrency map; preserves input order in the output. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
