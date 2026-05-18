import { spawn } from 'node:child_process';
import { RenderError } from '../errors.js';

export interface FfmpegConfig {
  ffmpegPath: string;
  ffprobePath: string;
}

export async function runFfmpeg(
  step: string,
  cfg: FfmpegConfig,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cfg.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const errChunks: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', (err) => reject(new RenderError(step, err.message)));
    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf-8');
        reject(new RenderError(step, `ffmpeg exited ${code}`, stderr.slice(-1500)));
        return;
      }
      resolve();
    });
  });
}

export async function runFfprobe(cfg: FfmpegConfig, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cfg.ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on('data', (c: Buffer) => outChunks.push(c));
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', (err) => reject(new RenderError('ffprobe', err.message)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new RenderError('ffprobe', `exited ${code}`, Buffer.concat(errChunks).toString().slice(-500)),
        );
        return;
      }
      resolve(Buffer.concat(outChunks).toString('utf-8'));
    });
  });
}

export async function probeDurationSec(cfg: FfmpegConfig, file: string): Promise<number> {
  const out = await runFfprobe(cfg, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const d = Number.parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new RenderError('probe', `invalid duration: ${out}`);
  return d;
}

export async function probeHasAudio(cfg: FfmpegConfig, file: string): Promise<boolean> {
  const out = await runFfprobe(cfg, [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=codec_type',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return out.trim().includes('audio');
}

export async function probeHasVideo(cfg: FfmpegConfig, file: string): Promise<boolean> {
  const out = await runFfprobe(cfg, [
    '-v', 'error',
    '-select_streams', 'v',
    '-show_entries', 'stream=codec_type',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return out.trim().includes('video');
}
