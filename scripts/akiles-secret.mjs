import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export const AKILES_SECRET_ID = 'yalla/akiles';
const REGION = 'eu-central-1';

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const client = new SecretsManagerClient({ region: REGION });

export const loadAkilesSecret = async () => {
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: AKILES_SECRET_ID }),
  );
  const raw = result.SecretString;
  if (!raw) {
    throw new Error('yalla/akiles has no SecretString.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('yalla/akiles must be a JSON object.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('yalla/akiles must be a JSON object.');
  }
  return parsed;
};

export const saveAkilesSecret = async (payload) => {
  await client.send(
    new PutSecretValueCommand({
      SecretId: AKILES_SECRET_ID,
      SecretString: JSON.stringify(payload),
    }),
  );
};

export const mergeAkilesSecret = async (patch) => {
  const current = await loadAkilesSecret();
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const text = asString(value);
    if (text) {
      next[key] = text;
    }
  }
  await saveAkilesSecret(next);
  return next;
};

export const readAkilesField = (payload, aliases) => {
  const byKey = new Map();
  for (const [key, value] of Object.entries(payload)) {
    const text = asString(value);
    if (text) {
      byKey.set(key.toLowerCase().replace(/[\s_-]/g, ''), text);
    }
  }
  for (const alias of aliases) {
    const match = byKey.get(alias.toLowerCase().replace(/[\s_-]/g, ''));
    if (match) {
      return match;
    }
  }
  return '';
};
