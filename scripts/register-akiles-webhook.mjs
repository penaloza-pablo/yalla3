#!/usr/bin/env node
// Registers (or replaces) the Akiles gadget_action webhook that marks Yalla
// check-ins. Reads tokens from yalla/akiles and writes webhookSecret back.
// Values are never printed.

import {
  loadAkilesSecret,
  mergeAkilesSecret,
  readAkilesField,
} from './akiles-secret.mjs';

const API_BASE = 'https://api.akiles.app/v2';

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const readArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length).trim();
  return asString(process.env[name] || fallback);
};

const authHeader = (token) => ({ authorization: `Bearer ${token}` });

const parseJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const listWebhooks = async (token) => {
  const items = [];
  let cursor = '';
  do {
    const url = new URL(`${API_BASE}/webhooks`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, { headers: authHeader(token) });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(`List webhooks failed (${response.status}).`);
    }
    items.push(...(Array.isArray(payload.data) ? payload.data : []));
    cursor = payload.has_next ? asString(payload.cursor_next) : '';
  } while (cursor);
  return items;
};

const deleteWebhook = async (token, webhookId) => {
  const response = await fetch(`${API_BASE}/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete webhook failed (${response.status}).`);
  }
};

const createWebhook = async (token, url) => {
  const bodies = [
    {
      url,
      is_enabled: true,
      expand: ['subject_member'],
      filter: [{ verb: 'use', 'object.type': 'gadget_action' }],
    },
    {
      url,
      is_enabled: true,
      expand: ['subject_member'],
      filter: [{ verb: 'use', object_type: 'gadget_action' }],
    },
    {
      url,
      is_enabled: true,
      filter: [{ verb: 'use', object_type: 'gadget_action' }],
    },
  ];
  let lastStatus = 0;
  for (const body of bodies) {
    const response = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: {
        ...authHeader(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await parseJson(response);
    if (response.ok) {
      return payload;
    }
    lastStatus = response.status;
  }
  throw new Error(`Create webhook failed (${lastStatus}).`);
};

const normalizeUrl = (value) => value.replace(/\/+$/, '');

const main = async () => {
  const secret = await loadAkilesSecret();
  const token =
    readArg('AKILES_ACCESS_TOKEN') ||
    readAkilesField(secret, ['accessToken', 'access_token', 'AKILES_ACCESS_TOKEN']);
  const url = readArg('RECEIVE_AKILES_EVENTS_URL');
  if (!token) {
    throw new Error('yalla/akiles is missing accessToken. Run scripts/akiles-oauth-token.mjs first.');
  }
  if (!url) {
    throw new Error('RECEIVE_AKILES_EVENTS_URL is required (Lambda Function URL after deploy).');
  }

  const target = normalizeUrl(url);
  const existing = await listWebhooks(token);
  for (const webhook of existing) {
    if (normalizeUrl(asString(webhook.url)) === target) {
      await deleteWebhook(token, asString(webhook.id));
    }
  }

  const created = await createWebhook(token, url);
  const webhookId = asString(created.id);
  const webhookSecret = asString(created.secret);
  if (!webhookId || !webhookSecret) {
    throw new Error('Akiles did not return webhook id/secret.');
  }
  await mergeAkilesSecret({ webhookSecret, webhookId });
  process.stdout.write(`Webhook registered (${webhookId}). Secret saved to yalla/akiles.\n`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
