import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { selectModel } from '../src/models.js';

const SAVED = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

function clearApiKeys(): void {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
}

describe('selectModel', () => {
  beforeEach(() => {
    clearApiKeys();
  });

  afterEach(() => {
    if (SAVED.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = SAVED.openai;
    if (SAVED.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = SAVED.anthropic;
  });

  it('prefers openai', () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const selection = selectModel();

    expect(selection.provider).toBe('openai');
    expect(selection.model).toBeNull();
  });

  it('uses anthropic when openai is absent', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const selection = selectModel();

    expect(selection.provider).toBe('anthropic');
    expect(selection.model).toBe('claude-sonnet-5');
  });

  it('prefers openai when both keys are set', () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const selection = selectModel();

    expect(selection.provider).toBe('openai');
    expect(selection.model).toBeNull();
  });

  it('requires a supported api key', () => {
    expect(() => selectModel()).toThrow(
      /OPENAI_API_KEY or ANTHROPIC_API_KEY/,
    );
  });
});
