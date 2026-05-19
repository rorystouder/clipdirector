import Anthropic from '@anthropic-ai/sdk';
import type { RenderJobInput } from '@clipdirector/shared-types';
import { TIMEOUTS, withTimeout } from '@clipdirector/shared-types';
import { ManifestParseError } from '../errors.js';
import {
  EDIT_MANIFEST_SCHEMA_EXAMPLE,
  SYSTEM_PROMPT,
  stripJsonFences,
} from './prompts.js';

export interface FrameSample {
  clipId: string;
  clipIndex: number;
  timestampSec: number;
  durationSec: number;
  base64Jpeg: string;
}

export interface ReasoningParams {
  renderJobInput: RenderJobInput;
  frameSamples: FrameSample[];
  transcripts: string[];
  clipCount: number;
  validationErrors?: string;
}

export interface ClaudeClient {
  callReasoning(params: ReasoningParams): Promise<unknown>;
}

export interface ClaudeClientConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export function createClaudeClient(config: ClaudeClientConfig): ClaudeClient {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async callReasoning(params: ReasoningParams): Promise<unknown> {
      const userMessage = buildUserMessage(params);

      const response = await withTimeout(
        client.messages.create({
          model: config.model,
          max_tokens: config.maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
        TIMEOUTS.claudeApiMs,
        'claude-api',
      );

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new ManifestParseError('Claude returned no text content', '');
      }

      const cleaned = stripJsonFences(textBlock.text);
      try {
        return JSON.parse(cleaned);
      } catch (err) {
        throw new ManifestParseError('Claude returned non-JSON output', cleaned, err);
      }
    },
  };
}

function buildUserMessage(params: ReasoningParams): Anthropic.MessageParam['content'] {
  const { renderJobInput, frameSamples, transcripts, clipCount, validationErrors } = params;

  const imageBlocks = frameSamples.map((sample) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: sample.base64Jpeg,
    },
  }));

  const clipMeta = Array.from({ length: clipCount }, (_, i) => {
    const id = `clip_${String(i).padStart(2, '0')}`;
    const frames = frameSamples.filter((f) => f.clipId === id);
    const duration = frames[frames.length - 1]?.durationSec ?? 0;
    const transcript = transcripts[i] ?? '';
    const transcriptSnippet = transcript ? `, speech="${transcript.slice(0, 100)}..."` : '';
    return `${id}: duration=${duration.toFixed(1)}s${transcriptSnippet}`;
  }).join('\n');

  const lines: string[] = [
    `USER BRIEF: "${renderJobInput.userPrompt}"`,
    `TARGET PLATFORM: ${renderJobInput.platform}`,
    `MUSIC MOOD: ${renderJobInput.musicMood}`,
    `CAPTION STYLE: ${renderJobInput.captionStyle}`,
    `CLIP INVENTORY:`,
    clipMeta,
    ``,
    `EDIT MANIFEST SCHEMA (you must return exactly this shape):`,
    JSON.stringify(EDIT_MANIFEST_SCHEMA_EXAMPLE, null, 2),
  ];

  if (validationErrors) {
    lines.push('');
    lines.push('PREVIOUS RESPONSE FAILED VALIDATION. Fix these issues and return a corrected manifest:');
    lines.push(validationErrors);
  }

  return [...imageBlocks, { type: 'text' as const, text: lines.join('\n') }];
}
