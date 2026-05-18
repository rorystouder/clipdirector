import { describe, expect, it } from 'vitest';
import type { EditManifest } from '@clipdirector/shared-types';
import { ManifestValidationError } from '../errors.js';
import { validateManifest } from './validator.js';

const validManifest: EditManifest = {
  schemaVersion: '1.0',
  targetDurationSec: 30,
  aspectRatio: '9:16',
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
  audioDuckOnSpeech: true,
  clips: [
    { id: 'clip_00', startSec: 0, endSec: 4.5, transition: 'cut', speed: 1 },
    { id: 'clip_01', startSec: 1.2, endSec: 6, transition: 'fade', speed: 1 },
  ],
  titleCards: [{ text: 'Hi', startSec: 0, durationSec: 2, position: 'center' }],
  captions: [{ text: 'Hello', startSec: 4.5, endSec: 6.5 }],
};

describe('validateManifest (T-05, T-07)', () => {
  it('T-05: a fully valid manifest passes and returns the parsed object', () => {
    const result = validateManifest(validManifest);
    expect(result).toEqual(validManifest);
  });

  it('T-07: clip with endSec <= startSec fails validation', () => {
    const bad = {
      ...validManifest,
      clips: [{ id: 'clip_00', startSec: 5, endSec: 5, transition: 'cut', speed: 1 }],
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
    try {
      validateManifest(bad);
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError);
      const ve = err as ManifestValidationError;
      expect(ve.issues.some((i) => /endSec must be greater than startSec/.test(i.message))).toBe(true);
    }
  });

  it('rejects clip id that is not clip_NN format', () => {
    const bad = {
      ...validManifest,
      clips: [{ id: 'clip_1', startSec: 0, endSec: 4, transition: 'cut', speed: 1 }],
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects clip speed outside 0.5..2.0', () => {
    const bad = {
      ...validManifest,
      clips: [{ id: 'clip_00', startSec: 0, endSec: 4, transition: 'cut', speed: 3 }],
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects targetDurationSec greater than 90', () => {
    expect(() => validateManifest({ ...validManifest, targetDurationSec: 91 })).toThrow(
      ManifestValidationError,
    );
  });

  it('rejects empty clips array', () => {
    expect(() => validateManifest({ ...validManifest, clips: [] })).toThrow(ManifestValidationError);
  });

  it('rejects schemaVersion other than "1.0"', () => {
    expect(() => validateManifest({ ...validManifest, schemaVersion: '2.0' as never })).toThrow(
      ManifestValidationError,
    );
  });

  it('rejects aspectRatio outside enum', () => {
    expect(() =>
      validateManifest({ ...validManifest, aspectRatio: '4:3' as never }),
    ).toThrow(ManifestValidationError);
  });

  it('rejects titleCard durationSec greater than 5', () => {
    const bad = {
      ...validManifest,
      titleCards: [{ text: 'Long', startSec: 0, durationSec: 6, position: 'center' }],
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects caption with endSec <= startSec', () => {
    const bad = {
      ...validManifest,
      captions: [{ text: 'oops', startSec: 5, endSec: 5 }],
    };
    expect(() => validateManifest(bad)).toThrow(ManifestValidationError);
  });

  it('rejects clips array larger than 12', () => {
    const tooMany = {
      ...validManifest,
      clips: Array.from({ length: 13 }, (_, i) => ({
        id: `clip_${String(i).padStart(2, '0')}`,
        startSec: 0,
        endSec: 1,
        transition: 'cut' as const,
        speed: 1,
      })),
    };
    expect(() => validateManifest(tooMany)).toThrow(ManifestValidationError);
  });

  it('ManifestValidationError.formatIssuesForPrompt produces a non-empty string with paths', () => {
    try {
      validateManifest({ ...validManifest, targetDurationSec: 200 });
    } catch (err) {
      const ve = err as ManifestValidationError;
      const formatted = ve.formatIssuesForPrompt();
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('targetDurationSec');
    }
  });
});
