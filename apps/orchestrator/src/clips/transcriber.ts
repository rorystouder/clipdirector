import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import { TranscriptionError } from '../errors.js';

export interface Transcriber {
  transcribeAll(clipPaths: string[]): Promise<string[]>;
}

export interface OpenAiTranscriberConfig {
  apiKey: string;
  ffprobePath: string;
  model?: string;
}

export function createOpenAiTranscriber(config: OpenAiTranscriberConfig): Transcriber {
  const openai = new OpenAI({ apiKey: config.apiKey });
  const model = config.model ?? 'whisper-1';

  return {
    async transcribeAll(clipPaths: string[]): Promise<string[]> {
      const transcripts: string[] = [];
      for (const [index, clipPath] of clipPaths.entries()) {
        const hasAudio = await probeHasAudio(config.ffprobePath, clipPath);
        if (!hasAudio) {
          transcripts.push('');
          continue;
        }
        try {
          const response = await openai.audio.transcriptions.create({
            file: createReadStream(clipPath),
            model,
          });
          transcripts.push(response.text ?? '');
        } catch (err) {
          throw new TranscriptionError(
            `Whisper failed for clip ${index}: ${(err as Error).message}`,
            index,
          );
        }
      }
      return transcripts;
    },
  };
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
