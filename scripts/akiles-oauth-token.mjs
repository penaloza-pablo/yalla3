#!/usr/bin/env node
// One-time OAuth for the Yalla Akiles app. Reads clientId/clientSecret from
// Secrets Manager yalla/akiles, listens on the Developer Center Redirect URL,
// then writes accessToken and refreshToken back to the same secret.
// Values are never printed.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  loadAkilesSecret,
  mergeAkilesSecret,
  readAkilesField,
} from './akiles-secret.mjs';

const AUTH_URL = 'https://auth.akiles.app/oauth2/auth';
const TOKEN_URL = 'https://auth.akiles.app/oauth2/token';
const REDIRECT_URI = 'http://127.0.0.1:8765/akiles/callback';
const SCOPE = 'full_read_only offline';

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const exchangeCode = async (clientId, clientSecret, code) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}).`);
  }
  return payload;
};

const secret = await loadAkilesSecret().catch((error) => {
  if (asString(error?.name) === 'AccessDeniedException' || /AccessDenied/i.test(asString(error?.message))) {
    return {};
  }
  throw error;
});
const clientId =
  asString(process.env.AKILES_CLIENT_ID) ||
  readAkilesField(secret, ['clientId', 'client_id', 'AKILES_CLIENT_ID']);
const clientSecret =
  asString(process.env.AKILES_CLIENT_SECRET) ||
  readAkilesField(secret, [
    'clientSecret',
    'client_secret',
    'AKILES_CLIENT_SECRET',
  ]);
if (!clientId || !clientSecret) {
  console.error(
    'Cannot read yalla/akiles. Add a resource policy for amplify-admin, or set AKILES_CLIENT_ID and AKILES_CLIENT_SECRET.',
  );
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authorize = new URL(AUTH_URL);
authorize.searchParams.set('client_id', clientId);
authorize.searchParams.set('redirect_uri', REDIRECT_URI);
authorize.searchParams.set('response_type', 'code');
authorize.searchParams.set('scope', SCOPE);
authorize.searchParams.set('state', state);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname !== '/akiles/callback') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  if (asString(url.searchParams.get('state')) !== state) {
    response.writeHead(400);
    response.end('Invalid state');
    return;
  }
  const code = asString(url.searchParams.get('code'));
  if (!code) {
    response.writeHead(400);
    response.end(asString(url.searchParams.get('error')) || 'Missing code');
    return;
  }
  try {
    const tokens = await exchangeCode(clientId, clientSecret, code);
    const accessToken = asString(tokens.access_token);
    const refreshToken = asString(tokens.refresh_token);
    if (!accessToken) {
      throw new Error('Token exchange returned no access_token.');
    }
    await mergeAkilesSecret({ accessToken, refreshToken });
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Akiles autorizado. Ya puedes cerrar esta pestana.');
    process.stdout.write(
      refreshToken
        ? 'Tokens saved to yalla/akiles.\n'
        : 'accessToken saved, but no refreshToken. Re-run with scope offline.\n',
    );
  } catch (error) {
    response.writeHead(500);
    response.end('Token exchange failed. Check the terminal.');
    console.error(error instanceof Error ? error.message : error);
  } finally {
    server.close();
  }
});

server.listen(8765, '127.0.0.1', () => {
  process.stdout.write(
    [
      'Open this URL, choose the Knock-Knock Akiles organization, and allow access:',
      '',
      authorize.toString(),
      '',
    ].join('\n'),
  );
});
