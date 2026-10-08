import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  recordActivityLog,
} from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { loadSlackSecrets, slackApi } from '../shared/slack';
import { appPageUrl, escapeMrkdwn } from '../shared/slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from '../shared/slack-notifications';
import { docClient, getNowTimeInMadrid } from '../shared/visit-task-utils';
import {
  checkDynamoOpsTables,
  checkGuestyOpenApi,
  checkLambdaBoots,
  checkLambdaConfiguration,
  checkLambdaWebhookReceiver,
  checkSlackBot,
} from '../shared/yalla-services-checks';
import {
  YALLA_SERVICE_IDS,
  appendServiceRun,
  diagnoseSlotFromMadridTime,
  healthRecord,
  mapServiceHealth,
  monitoredYallaServices,
  publicServiceCatalog,
  yallaServiceById,
  type YallaServiceDefinition,
  type YallaServiceHealth,
} from '../shared/yalla-services';

const loadHealth = async (
  tableName: string,
  service: YallaServiceDefinition,
) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { serviceId: service.id },
    }),
  );
  return mapServiceHealth(
    service,
    (result.Item as Record<string, unknown> | undefined) ?? null,
  );
};

const persistHealth = async (tableName: string, health: YallaServiceHealth) => {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: healthRecord(health),
    }),
  );
};

const runMonitoredCheck = async (service: YallaServiceDefinition) => {
  switch (service.id) {
    case YALLA_SERVICE_IDS.guestyBookingsReceiver:
      return checkLambdaWebhookReceiver(
        process.env.BOOKINGS_RECEIVER_FUNCTION || 'yalla-bookingsReceiver',
        { healthyBodySnippets: ['Missing ReservationID'] },
      );
    case YALLA_SERVICE_IDS.guestyTasksReceiver:
      return checkLambdaWebhookReceiver(
        process.env.TASKS_RECEIVER_FUNCTION || 'yalla-tasksReceiver',
        { healthyBodySnippets: ['Missing GuestyTaskID'] },
      );
    case YALLA_SERVICE_IDS.guestyOpenApi:
      return checkGuestyOpenApi();
    case YALLA_SERVICE_IDS.yallaSyncTaskToGuesty:
      return checkLambdaBoots(
        process.env.SYNC_TASK_TO_GUESTY_FUNCTION || 'yalla-syncTaskToGuesty',
      );
    case YALLA_SERVICE_IDS.slackBot:
      return checkSlackBot();
    case YALLA_SERVICE_IDS.checkInAccessCron:
      return checkLambdaConfiguration(
        process.env.NOTIFY_CLEANING_OVERDUE_FUNCTION || '',
      );
    case YALLA_SERVICE_IDS.akilesLockEvents:
      return checkLambdaWebhookReceiver(
        process.env.RECEIVE_AKILES_FUNCTION || '',
        { healthyBodySnippets: ['bad sig', 'Body is required'] },
      );
    case YALLA_SERVICE_IDS.dynamodbOpsTables:
      return checkDynamoOpsTables();
    default:
      return {
        ok: false as const,
        error: `No check implemented for ${service.id}.`,
      };
  }
};

const failureLines = (results: YallaServiceHealth[]) =>
  results
    .filter((item) => item.status === 'error')
    .map((item) => {
      const detail = item.detail ? ` ${item.detail}` : '';
      const label =
        yallaServiceById(item.serviceId)?.slackLabel || item.serviceId;
      return `• *${escapeMrkdwn(label)}*: ${escapeMrkdwn(item.error || 'unknown error')}${escapeMrkdwn(detail)}`;
    });

const notifyFailures = async (
  results: YallaServiceHealth[],
  slot: string,
  at: string,
) => {
  const failed = results.filter((item) => item.status === 'error');
  if (failed.length === 0) {
    return { notified: false, notifiedAt: '' };
  }
  if (
    !(await isSlackNotificationEnabled(SLACK_NOTIFICATION_IDS.yallaServicesHealth))
  ) {
    console.log('Yalla Services Slack skipped: automation disabled.');
    return { notified: false, notifiedAt: '' };
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error('Yalla Services Slack skipped: missing warningsChannelId.');
    return { notified: false, notifiedAt: '' };
  }
  const slotLabel = slot === 'manual' ? 'manual' : slot;
  const page = appPageUrl('Yalla Services');
  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text: [
      `*Yalla Services · diagnóstico ${escapeMrkdwn(slotLabel)}*`,
      failed.length === 1
        ? '1 servicio crítico no está operativo.'
        : `${failed.length} servicios críticos no están operativos.`,
      ...failureLines(failed),
      `<${page}|Abrir Administración > Yalla Services>`,
    ].join('\n'),
  });
  return { notified: true, notifiedAt: at };
};

const runDiagnostics = async (trigger: 'scheduled' | 'manual') => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME is not configured.');
  }
  const at = nowIso();
  const slot = diagnoseSlotFromMadridTime(getNowTimeInMadrid(), trigger);
  const results: YallaServiceHealth[] = [];
  for (const service of monitoredYallaServices()) {
    const previous = await loadHealth(tableName, service);
    const check = await runMonitoredCheck(service);
    const next = appendServiceRun(previous, {
      at,
      slot,
      status: check.ok ? 'ok' : 'error',
      ...(check.ok || !check.error ? {} : { error: check.error }),
    });
    next.detail = check.detail;
    await persistHealth(tableName, next);
    results.push(next);
  }
  let notify = { notified: false, notifiedAt: '' };
  try {
    notify = await notifyFailures(results, slot, at);
  } catch (error) {
    console.error('Yalla Services Slack failed', error);
  }
  if (notify.notified) {
    for (const item of results.filter((entry) => entry.status === 'error')) {
      const updated = { ...item, lastNotifiedAt: notify.notifiedAt };
      await persistHealth(tableName, updated);
    }
  }
  return {
    catalog: publicServiceCatalog(),
    items: results,
    slot,
    trigger,
    notified: notify.notified,
  };
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  source?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp && event.requestContext?.http?.method !== 'POST') {
    return buildHttpResponse(405, { message: 'Use POST to run a diagnosis.' });
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  try {
    const payload = await runDiagnostics(isHttp ? 'manual' : 'scheduled');
    if (isHttp) {
      await recordActivityLog(event, {
        feature: LOG_FEATURES.YALLA_SERVICES,
        action: 'diagnose',
        summary: `ran Yalla Services diagnosis (${payload.slot})`,
      });
    }
    return isHttp
      ? buildHttpResponse(200, payload)
      : payload;
  } catch (error) {
    console.error('Yalla Services diagnosis failed', error);
    if (isHttp) {
      return buildHttpResponse(500, {
        message: 'Failed to diagnose Yalla Services.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
};
