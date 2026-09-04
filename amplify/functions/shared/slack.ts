import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

const SLACK_MAX_SKEW_SECONDS = 60 * 5;

type SlackSecretCache = {
  signingSecret: string;
  botToken: string;
  cleaningOverdueChannelId: string;
  warningsChannelId: string;
};

let secretCache: SlackSecretCache | undefined;

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[\s_-]/g, '');

const readSecretField = (
  payload: Record<string, unknown>,
  aliases: string[],
) => {
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

export const loadSlackSecrets = async () => {
  if (secretCache) {
    return secretCache;
  }
  const secretId = process.env.SLACK_SECRET_ID || 'yalla/slack';
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  const raw = result.SecretString;
  if (!raw) {
    throw new Error('Slack secret has no SecretString.');
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const signingSecret = readSecretField(parsed, [
    'signingSecret',
    'Signing Secret',
    'SLACK_SIGNING_SECRET',
  ]);
  if (!signingSecret) {
    throw new Error('Slack secret is missing Signing Secret.');
  }
  secretCache = {
    signingSecret,
    botToken: readSecretField(parsed, [
      'botToken',
      'Bot User OAuth Token',
      'Bot Token',
      'xoxb',
    ]),
    cleaningOverdueChannelId: readSecretField(parsed, [
      'cleaningOverdueChannelId',
      'notifyChannelId',
    ]),
    warningsChannelId: readSecretField(parsed, [
      'warningsChannelId',
      'Warnings Channel Id',
      'WARNING_CHANNEL_ID',
    ]),
  };
  return secretCache;
};

export const getHeader = (
  headers: Record<string, string | undefined> | undefined,
  name: string,
) => {
  if (!headers) {
    return '';
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && value) {
      return value;
    }
  }
  return '';
};

export const decodeHttpBody = (event: {
  body?: string;
  isBase64Encoded?: boolean;
}) => {
  if (!event.body) {
    return '';
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
};

export const isValidSlackSignature = (options: {
  signingSecret: string;
  signature: string;
  timestamp: string;
  rawBody: string;
}) => {
  const timestamp = Number(options.timestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SLACK_MAX_SKEW_SECONDS) {
    return false;
  }
  if (!options.signature.startsWith('v0=')) {
    return false;
  }
  const base = `v0:${options.timestamp}:${options.rawBody}`;
  const digest = createHmac('sha256', options.signingSecret)
    .update(base)
    .digest('hex');
  const expected = Buffer.from(`v0=${digest}`, 'utf8');
  const received = Buffer.from(options.signature, 'utf8');
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
};

export const parseSlackFormBody = (rawBody: string) => {
  const params = new URLSearchParams(rawBody);
  return {
    command: (params.get('command') ?? '').trim(),
    text: (params.get('text') ?? '').trim(),
    responseUrl: (params.get('response_url') ?? '').trim(),
    channelId: (params.get('channel_id') ?? '').trim(),
    channelName: (params.get('channel_name') ?? '').trim(),
    userId: (params.get('user_id') ?? '').trim(),
  };
};

export const slackJsonResponse = (
  statusCode: number,
  payload: Record<string, unknown>,
) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

export const slackEmptyAck = () => ({
  statusCode: 200,
  headers: { 'content-type': 'text/plain' },
  body: '',
});

export const parseSlackInteractivePayload = (rawBody: string) => {
  const params = new URLSearchParams(rawBody);
  const rawPayload = params.get('payload');
  if (!rawPayload) {
    return null;
  }
  return JSON.parse(rawPayload) as Record<string, unknown>;
};

export const slackApi = async (
  method: string,
  body: Record<string, unknown>,
) => {
  const { botToken } = await loadSlackSecrets();
  if (!botToken) {
    throw new Error('Slack secret is missing Bot Token.');
  }
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${botToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    ts?: string;
    channel?: string;
  };
  if (!payload.ok) {
    throw new Error(payload.error || `Slack API ${method} failed.`);
  }
  return payload;
};
