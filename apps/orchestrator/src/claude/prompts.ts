import type { EditManifest } from '@clipdirector/shared-types';

export const SYSTEM_PROMPT = `
You are a professional video editor AI. Your job is to analyze video clips and a user's creative brief, then produce a structured edit manifest in JSON format.

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- The JSON must exactly match the EditManifest schema provided.
- Clip IDs must match the provided clip index format: clip_00, clip_01, etc.
- startSec and endSec must be within the clip's actual duration.
- Total assembled duration must not exceed targetDurationSec.
- schemaVersion must always be "1.0".
`.trim();

export const EDIT_MANIFEST_SCHEMA_EXAMPLE: EditManifest = {
  schemaVersion: '1.0',
  targetDurationSec: 30,
  aspectRatio: '9:16',
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
  audioDuckOnSpeech: true,
  clips: [
    { id: 'clip_00', startSec: 0.0, endSec: 4.5, transition: 'cut', speed: 1.0 },
    { id: 'clip_01', startSec: 1.2, endSec: 6.0, transition: 'fade', speed: 1.0 },
  ],
  titleCards: [
    { text: 'Opening title', startSec: 0, durationSec: 2, position: 'center' },
  ],
  captions: [
    { text: 'Sample caption text', startSec: 4.5, endSec: 6.5 },
  ],
};

export function stripJsonFences(text: string): string {
  return text.replace(/```json|```/g, '').trim();
}
