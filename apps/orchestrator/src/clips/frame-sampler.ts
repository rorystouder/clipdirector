import { spawn } from 'node:child_process';
import { FrameSamplingError } from '../errors.js';
import type { FrameSample } from '../claude/client.js';

export interface FrameSampler {
  sampleFrames(clipPaths: string[]): Promise<FrameSample[]>;
}

export interface FfmpegFrameSamplerConfig {
  ffmpegPath: string;
  ffprobePath: string;
  intervalSec?: number;
  maxWidth?: number;
  jpegQuality?: number;
  /**
   * Hard cap on frames extracted per clip. Worst-case 5-min clip at the
   * default 3 s interval = 100 frames; we cap at 20 (evenly distributed)
   * so a single clip can't dominate the Claude input token budget.
   */
  maxFramesPerClip?: number;
  /**
   * Hard cap on total frames sent in a single Claude `messages.create`
   * call. 12 clips × 20 = 240 max with per-clip cap; this acts as the
   * second budget gate when many clips combine. At ~300 input tokens
   * per 512-wide JPEG tile, 120 frames ≈ 36 k tokens — leaves plenty
   * of room under the 200 k context window for system prompt +
   * transcripts + retry overhead.
   */
  maxFramesPerJob?: number;
}

export function createFfmpegFrameSampler(config: FfmpegFrameSamplerConfig): FrameSampler {
  const intervalSec = config.intervalSec ?? 3;
  const maxWidth = config.maxWidth ?? 512;
  const jpegQuality = config.jpegQuality ?? 5;
  const maxFramesPerClip = config.maxFramesPerClip ?? 20;
  const maxFramesPerJob = config.maxFramesPerJob ?? 120;

  return {
    async sampleFrames(clipPaths: string[]): Promise<FrameSample[]> {
      // Pre-compute durations + per-clip frame counts so the per-job
      // budget can be distributed proportionally (a 60-s clip should
      // get more frames than a 5-s clip when we hit the cap).
      const durations: number[] = [];
      for (const clipPath of clipPaths) {
        durations.push(await probeDuration(config.ffprobePath, clipPath));
      }

      const totalDuration = durations.reduce((a, b) => a + b, 0);
      // Naive count if uncapped.
      const naiveCounts = durations.map((d) =>
        Math.min(maxFramesPerClip, Math.max(1, Math.ceil(d / intervalSec))),
      );
      const naiveTotal = naiveCounts.reduce((a, b) => a + b, 0);

      // If the naive plan exceeds the per-job cap, re-allocate proportionally
      // to clip duration. Each clip still gets at least 1 frame.
      let frameCounts: number[];
      if (naiveTotal <= maxFramesPerJob || totalDuration === 0) {
        frameCounts = naiveCounts;
      } else {
        frameCounts = durations.map((d) => {
          const share = (d / totalDuration) * maxFramesPerJob;
          return Math.max(1, Math.min(maxFramesPerClip, Math.floor(share)));
        });
      }

      const samples: FrameSample[] = [];
      for (const [index, clipPath] of clipPaths.entries()) {
        const duration = durations[index]!;
        const count = frameCounts[index]!;
        const timestamps = evenlyDistribute(duration, count);

        for (const ts of timestamps) {
          const jpegBuffer = await extractFrame(config.ffmpegPath, clipPath, ts, maxWidth, jpegQuality);
          samples.push({
            clipId: `clip_${String(index).padStart(2, '0')}`,
            clipIndex: index,
            timestampSec: ts,
            durationSec: duration,
            base64Jpeg: jpegBuffer.toString('base64'),
          });
        }
      }
      return samples;
    },
  };
}

/**
 * Distribute `count` timestamps evenly across [0, duration). Always returns
 * at least one timestamp (the start). Never returns the exact end of the
 * clip — ffmpeg's seek may fail on EOF.
 */
function evenlyDistribute(duration: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const usable = Math.max(0, duration - 0.1);
  const step = usable / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.min(i * step, usable));
}

async function probeDuration(ffprobePath: string, clipPath: string): Promise<number> {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    clipPath,
  ];
  const { stdout } = await runCommand(ffprobePath, args);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new FrameSamplingError(`ffprobe returned invalid duration: ${stdout}`, clipPath);
  }
  return duration;
}

async function extractFrame(
  ffmpegPath: string,
  clipPath: string,
  ts: number,
  maxWidth: number,
  quality: number,
): Promise<Buffer> {
  const args = [
    '-ss', String(ts),
    '-i', clipPath,
    '-vframes', '1',
    '-vf', `scale=${maxWidth}:-1`,
    '-f', 'image2',
    '-q:v', String(quality),
    'pipe:1',
  ];
  const { stdoutBuffer } = await runCommand(ffmpegPath, args, { captureBinary: true });
  if (stdoutBuffer.length === 0) {
    throw new FrameSamplingError(`ffmpeg produced empty frame at t=${ts}`, clipPath);
  }
  return stdoutBuffer;
}

interface RunOptions {
  captureBinary?: boolean;
}

async function runCommand(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<{ stdout: string; stdoutBuffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      resolve({
        stdout: opts.captureBinary ? '' : stdoutBuffer.toString('utf-8'),
        stdoutBuffer,
      });
    });
  });
}
