import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptionEntry, ClipInstruction, EditManifest, TitleCard } from '@clipdirector/shared-types';
import { RenderError } from '../errors.js';
import { probeHasAudio, probeHasVideo, runFfmpeg, type FfmpegConfig } from './runner.js';

export interface PipelineInput {
  jobId: string;
  manifest: EditManifest;
  localClipPaths: string[];
  workDir: string;
  musicPath: string | null;
  fontFile?: string;
}

export interface PipelineDeps {
  ffmpeg: FfmpegConfig;
}

const DIMENSIONS: Record<EditManifest['aspectRatio'], { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
};

export async function runRenderPipeline(input: PipelineInput, deps: PipelineDeps): Promise<string> {
  await mkdir(input.workDir, { recursive: true });
  const segDir = path.join(input.workDir, 'segments');
  await mkdir(segDir, { recursive: true });

  // Step 1: trim per clip
  const trimmed: string[] = [];
  for (let i = 0; i < input.manifest.clips.length; i++) {
    const clip = input.manifest.clips[i]!;
    const source = resolveSource(clip, input.localClipPaths);
    const out = path.join(segDir, `segment_${pad(i)}.mp4`);
    await stepTrim(deps.ffmpeg, source, clip, out);
    trimmed.push(out);
  }

  // Step 2: speed adjustment (skip clips with speed === 1.0)
  const sped: string[] = [];
  for (let i = 0; i < input.manifest.clips.length; i++) {
    const clip = input.manifest.clips[i]!;
    if (clip.speed === 1.0) {
      sped.push(trimmed[i]!);
      continue;
    }
    const out = path.join(segDir, `segment_${pad(i)}_speed.mp4`);
    await stepSpeed(deps.ffmpeg, trimmed[i]!, clip.speed, out);
    sped.push(out);
  }

  // Step 3: scale + pad to target aspect ratio; ensure audio stream
  const dims = DIMENSIONS[input.manifest.aspectRatio];
  const scaled: string[] = [];
  for (let i = 0; i < sped.length; i++) {
    const out = path.join(segDir, `segment_${pad(i)}_scaled.mp4`);
    await stepScale(deps.ffmpeg, sped[i]!, dims, out);
    scaled.push(out);
  }

  // Step 4: concat
  const concatOut = path.join(input.workDir, 'concat.mp4');
  await stepConcat(deps.ffmpeg, scaled, input.workDir, concatOut);

  // Step 5: transitions — MVP implements cut only.
  // fade/dissolve types are accepted by the manifest but logged & treated as cut here.
  const transitionsOut = concatOut;

  // Step 6: mix music (skip if musicMood === 'none' or musicPath null)
  let withMusic = transitionsOut;
  if (input.musicPath && input.manifest.musicMood !== 'none') {
    withMusic = path.join(input.workDir, 'with_music.mp4');
    await stepMixMusic(deps.ffmpeg, transitionsOut, input.musicPath, withMusic);
  }

  // Step 7: title overlays
  let withTitles = withMusic;
  if (input.manifest.titleCards.length > 0) {
    withTitles = path.join(input.workDir, 'with_titles.mp4');
    await stepOverlayTitles(deps.ffmpeg, withMusic, input.manifest.titleCards, dims, withTitles, input.fontFile);
  }

  // Step 8: captions
  let withCaptions = withTitles;
  if (input.manifest.captions.length > 0 && input.manifest.captionStyle !== 'none') {
    withCaptions = path.join(input.workDir, 'with_captions.mp4');
    await stepOverlayCaptions(deps.ffmpeg, withTitles, input.manifest.captions, dims, withCaptions, input.fontFile);
  }

  // Step 9: final encode
  const finalOut = path.join(input.workDir, 'output.mp4');
  await stepFinalEncode(deps.ffmpeg, withCaptions, finalOut);

  if (!(await probeHasVideo(deps.ffmpeg, finalOut))) {
    throw new RenderError('final-encode', 'output.mp4 has no video stream');
  }

  return finalOut;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function resolveSource(clip: ClipInstruction, paths: string[]): string {
  const match = /^clip_(\d+)$/.exec(clip.id);
  if (!match) throw new RenderError('trim', `Invalid clip id ${clip.id}`);
  const idx = Number.parseInt(match[1]!, 10);
  const p = paths[idx];
  if (!p) throw new RenderError('trim', `No local file for clip index ${idx}`);
  return p;
}

async function stepTrim(
  cfg: FfmpegConfig,
  source: string,
  clip: ClipInstruction,
  out: string,
): Promise<void> {
  // Re-encode for frame-accurate trim (input -ss can be imprecise with -c copy).
  await runFfmpeg('trim', cfg, [
    '-y',
    '-ss', String(clip.startSec),
    '-to', String(clip.endSec),
    '-i', source,
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac', '-b:a', '128k',
    '-strict', 'experimental',
    out,
  ]);
}

async function stepSpeed(cfg: FfmpegConfig, input: string, speed: number, out: string): Promise<void> {
  const hasAudio = await probeHasAudio(cfg, input);
  const videoSetpts = `setpts=${(1 / speed).toFixed(6)}*PTS`;
  if (hasAudio) {
    await runFfmpeg('speed', cfg, [
      '-y', '-i', input,
      '-filter_complex', `[0:v]${videoSetpts}[v];[0:a]atempo=${speed.toFixed(3)}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
      out,
    ]);
  } else {
    await runFfmpeg('speed', cfg, [
      '-y', '-i', input,
      '-vf', videoSetpts,
      '-an',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      out,
    ]);
  }
}

async function stepScale(
  cfg: FfmpegConfig,
  input: string,
  dims: { w: number; h: number },
  out: string,
): Promise<void> {
  const vf = `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`;
  const hasAudio = await probeHasAudio(cfg, input);
  if (hasAudio) {
    await runFfmpeg('scale', cfg, [
      '-y', '-i', input,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-b:a', '128k',
      out,
    ]);
  } else {
    // Add silent audio so downstream concat + amix has a consistent track shape.
    await runFfmpeg('scale', cfg, [
      '-y', '-i', input,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', vf,
      '-map', '0:v', '-map', '1:a',
      '-shortest',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-b:a', '128k',
      out,
    ]);
  }
}

async function stepConcat(
  cfg: FfmpegConfig,
  segments: string[],
  workDir: string,
  out: string,
): Promise<void> {
  const listPath = path.join(workDir, 'concat-list.txt');
  const contents = segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
  await writeFile(listPath, contents, 'utf-8');
  await runFfmpeg('concat', cfg, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    out,
  ]);
}

async function stepMixMusic(
  cfg: FfmpegConfig,
  videoIn: string,
  musicIn: string,
  out: string,
): Promise<void> {
  // Per PRD §8.4 sample command. audioDuckOnSpeech is deferred (MVP).
  await runFfmpeg('music-mix', cfg, [
    '-y',
    '-i', videoIn,
    '-i', musicIn,
    '-filter_complex',
    '[1:a]volume=0.3[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]',
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    out,
  ]);
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "’")
    .replace(/%/g, '\\%');
}

function yForPosition(pos: TitleCard['position'], h: number): string {
  if (pos === 'top') return String(Math.floor(h * 0.08));
  if (pos === 'bottom') return String(Math.floor(h * 0.82));
  return `(h-text_h)/2`;
}

async function stepOverlayTitles(
  cfg: FfmpegConfig,
  input: string,
  titles: TitleCard[],
  dims: { w: number; h: number },
  out: string,
  fontFile: string | undefined,
): Promise<void> {
  const filters = titles.map((t) => {
    const text = escapeDrawtext(t.text);
    const y = yForPosition(t.position, dims.h);
    const enable = `between(t,${t.startSec},${t.startSec + t.durationSec})`;
    const fontPart = fontFile ? `fontfile='${fontFile}':` : '';
    return `drawtext=${fontPart}text='${text}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=${y}:enable='${enable}'`;
  });
  await runFfmpeg('titles', cfg, [
    '-y',
    '-i', input,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'copy',
    out,
  ]);
}

async function stepOverlayCaptions(
  cfg: FfmpegConfig,
  input: string,
  captions: CaptionEntry[],
  dims: { w: number; h: number },
  out: string,
  fontFile: string | undefined,
): Promise<void> {
  const y = Math.floor(dims.h * 0.78);
  const filters = captions.map((c) => {
    const text = escapeDrawtext(c.text);
    const enable = `between(t,${c.startSec},${c.endSec})`;
    const fontPart = fontFile ? `fontfile='${fontFile}':` : '';
    return `drawtext=${fontPart}text='${text}':fontsize=44:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=${y}:enable='${enable}'`;
  });
  await runFfmpeg('captions', cfg, [
    '-y',
    '-i', input,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'copy',
    out,
  ]);
}

async function stepFinalEncode(cfg: FfmpegConfig, input: string, out: string): Promise<void> {
  await runFfmpeg('final-encode', cfg, [
    '-y',
    '-i', input,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    out,
  ]);
}
