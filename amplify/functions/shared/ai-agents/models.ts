export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export const OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o4-mini',
] as const;

export type OpenAiModelId = (typeof OPENAI_MODELS)[number];

export const isAllowedOpenAiModel = (value: string): value is OpenAiModelId =>
  (OPENAI_MODELS as readonly string[]).includes(value);
