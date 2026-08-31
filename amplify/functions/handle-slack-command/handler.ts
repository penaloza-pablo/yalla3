import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { isHttpRequest } from '../shared/dynamo-http';
import {
  decodeHttpBody,
  getHeader,
  isValidSlackSignature,
  loadSlackSecrets,
  parseSlackFormBody,
  slackJsonResponse,
} from '../shared/slack';

const lambdaClient = new LambdaClient({});

type SlackHttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

const enqueueHoy = async (responseUrl: string) => {
  const functionName = process.env.PROCESS_SLACK_HOY_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('PROCESS_SLACK_HOY_FUNCTION_NAME is not configured.');
  }
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ responseUrl })),
    }),
  );
};

export const handler = async (event: SlackHttpEvent) => {
  if (!isHttpRequest(event)) {
    return slackJsonResponse(400, { message: 'Expected an HTTP request.' });
  }

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'content-type': 'application/json' } };
  }

  if (event.requestContext?.http?.method !== 'POST') {
    return slackJsonResponse(405, { message: 'Method not allowed.' });
  }

  const rawBody = decodeHttpBody(event);
  const secrets = await loadSlackSecrets();
  const valid = isValidSlackSignature({
    signingSecret: secrets.signingSecret,
    signature: getHeader(event.headers, 'x-slack-signature'),
    timestamp: getHeader(event.headers, 'x-slack-request-timestamp'),
    rawBody,
  });
  if (!valid) {
    return slackJsonResponse(401, { message: 'Invalid Slack signature.' });
  }

  const payload = parseSlackFormBody(rawBody);
  const action = payload.text.toLowerCase();
  if (payload.command !== '/yalla' || action !== 'hoy') {
    return slackJsonResponse(200, {
      response_type: 'ephemeral',
      text: 'Usa `/yalla hoy` para ver el resumen del día.',
    });
  }
  if (!payload.responseUrl) {
    return slackJsonResponse(200, {
      response_type: 'ephemeral',
      text: 'Slack no envió response_url.',
    });
  }

  await enqueueHoy(payload.responseUrl);
  return slackJsonResponse(200, {
    response_type: 'ephemeral',
    text: 'Consultando el resumen de hoy…',
  });
};
