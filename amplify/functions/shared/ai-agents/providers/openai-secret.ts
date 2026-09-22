import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const CACHE_TTL_MS = 60 * 1000;

type OpenAiSecret = {
  apiKey: string;
  organization?: string;
};

let cache: { value: OpenAiSecret | null; expiresAt: number; missing: boolean } | undefined;

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[\s_-]/g, '');

const readField = (payload: Record<string, unknown>, aliases: string[]) => {
  const byNormalized = new Map<string, string>();
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.trim()) {
      byNormalized.set(normalizeKey(key), value.trim());
    }
  }
  for (const alias of aliases) {
    const match = byNormalized.get(normalizeKey(alias));
    if (match) {
      return match;
    }
  }
  return '';
};

export const openaiSecretId = () =>
  process.env.OPENAI_SECRET_ID || 'yalla/openai';

export const loadOpenAiSecret = async (options?: {
  forceRefresh?: boolean;
}): Promise<OpenAiSecret | null> => {
  if (
    !options?.forceRefresh &&
    cache &&
    Date.now() < cache.expiresAt
  ) {
    return cache.value;
  }
  try {
    const result = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: openaiSecretId() }),
    );
    const raw = result.SecretString;
    if (!raw) {
      cache = { value: null, missing: true, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const apiKey = readField(parsed, [
      'apiKey',
      'openaiApiKey',
      'OPENAI_API_KEY',
      'key',
    ]);
    if (!apiKey) {
      cache = { value: null, missing: true, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const value: OpenAiSecret = {
      apiKey,
      organization:
        readField(parsed, ['organization', 'openaiOrganization']) || undefined,
    };
    cache = { value, missing: false, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    cache = { value: null, missing: true, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
};

export const hasOpenAiCredentials = async () => {
  const secret = await loadOpenAiSecret();
  return Boolean(secret?.apiKey);
};
