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
}

export function createFfmpegFrameSampler(config: FfmpegFrameSamplerConfig): FrameSampler {
  const intervalSec = config.intervalSec ?? 3;
  const maxWidth = config.maxWidth ?? 512;
  const jpegQuality = config.jpegQuality ?? 5;

  return {
    async sampleFrames(clipPaths: string[]): Promise<FrameSample[]> {
      const samples: FrameSample[] = [];
      for (const [index, clipPath] of clipPaths.entries()) {
        const duration = await probeDuration(config.ffprobePath, clipPath);
        const timestamps = Array.from(
          { length: Math.max(1, Math.ceil(duration / intervalSec)) },
          (_, i) => Math.min(i * intervalSec, Math.max(0, duration - 0.1)),
        );

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
