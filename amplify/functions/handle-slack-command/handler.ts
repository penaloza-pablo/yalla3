import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { isHttpRequest } from '../shared/dynamo-http';
import {
  completeCleaningFromSlack,
  DONE_ACTION_ID,
  loadVisit,
  SNOOZE_ACTION_ID,
  SNOOZE_MODAL_CALLBACK,
  snoozeCleaningFromSlack,
  snoozeModalView,
} from '../shared/slack-cleaning';
import { normalizeStartTime } from '../shared/cleaning-plan';
import { getNowTimeInMadrid } from '../shared/visit-task-utils';
import {
  decodeHttpBody,
  getHeader,
  isValidSlackSignature,
  loadSlackSecrets,
  parseSlackFormBody,
  parseSlackInteractivePayload,
  slackApi,
  slackEmptyAck,
  slackJsonResponse,
} from '../shared/slack';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from '../shared/slack-notifications';

const lambdaClient = new LambdaClient({});

type SlackHttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asRecord = (value: unknown) =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;

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

const postEphemeral = async (responseUrl: string, text: string) => {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      response_type: 'ephemeral',
      replace_original: false,
      text,
    }),
  });
};

const handleBlockActions = async (payload: Record<string, unknown>) => {
  const visitsTable = process.env.TABLE_NAME;
  const tasksTable = process.env.TASKS_TABLE || '';
  if (!visitsTable) {
    throw new Error('TABLE_NAME is not configured.');
  }
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const action = asRecord(actions[0]);
  const actionId = asString(action?.action_id);
  const visitId = asString(action?.value);
  const channelId = asString(asRecord(payload.channel)?.id);
  const messageTs = asString(asRecord(payload.message)?.ts);
  const triggerId = asString(payload.trigger_id);
  const userId = asString(asRecord(payload.user)?.id);
  const responseUrl = asString(payload.response_url);

  if (!visitId) {
    return slackEmptyAck();
  }

  if (actionId === SNOOZE_ACTION_ID) {
    const visit = await loadVisit(visitsTable, visitId);
    const initialTime =
      normalizeStartTime(asString(visit?.scheduledEndTime)) ||
      getNowTimeInMadrid();
    await slackApi('views.open', {
      trigger_id: triggerId,
      view: snoozeModalView({
        visitId,
        channelId,
        messageTs,
        initialTime,
      }),
    });
    return slackEmptyAck();
  }

  if (actionId === DONE_ACTION_ID) {
    const result = await completeCleaningFromSlack({
      visitsTable,
      tasksTable,
      visitId,
      closedBy: userId,
      channelId,
      messageTs,
    });
    if (!result.ok && responseUrl) {
      await postEphemeral(responseUrl, result.message);
    }
    return slackEmptyAck();
  }

  return slackEmptyAck();
};

const handleViewSubmission = async (payload: Record<string, unknown>) => {
  const visitsTable = process.env.TABLE_NAME;
  if (!visitsTable) {
    throw new Error('TABLE_NAME is not configured.');
  }
  const view = asRecord(payload.view);
  if (asString(view?.callback_id) !== SNOOZE_MODAL_CALLBACK) {
    return slackEmptyAck();
  }
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(asString(view?.private_metadata) || '{}') as Record<
      string,
      unknown
    >;
  } catch {
    meta = {};
  }
  const values = asRecord(asRecord(view?.state)?.values);
  const selectedTime = asString(
    asRecord(asRecord(values?.end_time)?.scheduled_end_time)?.selected_time,
  );
  const result = await snoozeCleaningFromSlack({
    visitsTable,
    visitId: asString(meta.visitId),
    newEndTime: selectedTime,
    channelId: asString(meta.channelId),
    messageTs: asString(meta.messageTs),
  });
  if (!result.ok) {
    return slackJsonResponse(200, {
      response_action: 'errors',
      errors: { end_time: result.message },
    });
  }
  return slackJsonResponse(200, { response_action: 'clear' });
};

const handleInteractive = async (rawBody: string) => {
  const payload = parseSlackInteractivePayload(rawBody);
  if (!payload) {
    return slackEmptyAck();
  }
  const type = asString(payload.type);
  if (type === 'block_actions') {
    return handleBlockActions(payload);
  }
  if (type === 'view_submission') {
    return handleViewSubmission(payload);
  }
  return slackEmptyAck();
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
  const form = new URLSearchParams(rawBody);
  if (form.get('ssl_check')) {
    return slackEmptyAck();
  }
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

  if (rawBody.includes('payload=')) {
    try {
      return await handleInteractive(rawBody);
    } catch (error) {
      console.error('Slack interactive handler failed', error);
      return slackEmptyAck();
    }
  }

  const command = parseSlackFormBody(rawBody);
  const action = command.text.toLowerCase();
  if (command.command !== '/yalla' || action !== 'hoy') {
    return slackJsonResponse(200, {
      response_type: 'ephemeral',
      text: 'Usa `/yalla hoy` para ver el resumen del día.',
    });
  }
  if (!command.responseUrl) {
    return slackJsonResponse(200, {
      response_type: 'ephemeral',
      text: 'Slack no envió response_url.',
    });
  }

  if (!(await isSlackNotificationEnabled(SLACK_NOTIFICATION_IDS.slackHoy))) {
    return slackJsonResponse(200, {
      response_type: 'ephemeral',
      text: 'El resumen de hoy está deshabilitado en Yalla.',
    });
  }

  await enqueueHoy(command.responseUrl);
  return slackJsonResponse(200, {
    response_type: 'ephemeral',
    text: 'Consultando el resumen de hoy…',
  });
};
