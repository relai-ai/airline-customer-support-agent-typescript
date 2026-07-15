export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5';

export interface ModelSelection {
  provider: 'openai' | 'anthropic';
  model: string | null;
}

/** Select the runtime model provider from environment keys. */
export function selectModel(): ModelSelection {
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: null };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', model: ANTHROPIC_DEFAULT_MODEL };
  }

  throw new Error(
    'Set OPENAI_API_KEY or ANTHROPIC_API_KEY before starting the agent.',
  );
}
