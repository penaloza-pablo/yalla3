import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from '../shared/slack-notifications';

const lambdaClient = new LambdaClient({});

export type SlackHoyEvent = {
  responseUrl?: string;
};

type TodaySummary = {
  date?: string;
  cleaning: {
    planningReady: number;
    planningTotal: number;
    currentCompleted: number;
    currentTotal: number;
    previousOpen: number;
  };
  maintenance: {
    currentCompleted: number;
    currentTotal: number;
    previousOpen: number;
  };
  reviews: { needsAttention: number };
  unassignedTasks: { pending: number };
  inventory: {
    waitingDelivery: number;
    reorder: number;
    lowStock: number;
  };
};

const parseLambdaJson = (payloadText: string) => {
  const parsed = JSON.parse(payloadText) as {
    body?: string;
    message?: string;
  } & Partial<TodaySummary>;
  if (typeof parsed.body === 'string') {
    return JSON.parse(parsed.body) as Partial<TodaySummary> & {
      message?: string;
    };
  }
  return parsed;
};

const loadTodaySummary = async (): Promise<TodaySummary> => {
  const functionName = process.env.GET_TODAY_SUMMARY_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('GET_TODAY_SUMMARY_FUNCTION_NAME is not configured.');
  }
  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({})),
    }),
  );
  const payloadText = response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';
  if (response.FunctionError) {
    throw new Error(payloadText || response.FunctionError);
  }
  const body = parseLambdaJson(payloadText);
  if (
    !body.cleaning ||
    !body.maintenance ||
    !body.reviews ||
    !body.inventory
  ) {
    throw new Error(body.message || 'Today summary payload is incomplete.');
  }
  return {
    ...body,
    unassignedTasks: {
      pending: Number(body.unassignedTasks?.pending) || 0,
    },
  } as TodaySummary;
};

const formatDayMonth = (date?: string) => {
  const match = date?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return date?.trim() || '';
  }
  return `${match[3]}/${match[2]}`;
};

const ratio = (done: number, total: number) => `${done} de ${total}`;

const ratioLine = (label: string, done: number, total: number) => {
  const base = `${label}: ${ratio(done, total)}`;
  return total > 0 && done === total ? `${base} :white_check_mark:` : base;
};

const countLine = (label: string, count: number) =>
  count > 0 ? `${label}: ${count}` : null;

const section = (title: string, lines: string[]) => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: `*${title}*\n${lines.join('\n')}`,
  },
});

const todayBlocks = (summary: TodaySummary) => {
  const cleaningLines = [
    ratioLine(
      'Planificación pendiente',
      summary.cleaning.planningReady,
      summary.cleaning.planningTotal,
    ),
    summary.cleaning.currentTotal > 0
      ? ratioLine(
          'Limpiezas del día',
          summary.cleaning.currentCompleted,
          summary.cleaning.currentTotal,
        )
      : null,
    countLine('Limpiezas anteriores', summary.cleaning.previousOpen),
  ].filter((line): line is string => Boolean(line));

  const maintenanceLines = [
    summary.maintenance.currentTotal > 0
      ? ratioLine(
          'Mantenimientos del día',
          summary.maintenance.currentCompleted,
          summary.maintenance.currentTotal,
        )
      : null,
    countLine('Pendientes de estimar', summary.maintenance.previousOpen),
  ].filter((line): line is string => Boolean(line));

  const reviewsClear = summary.reviews.needsAttention === 0;
  const unassignedPending = summary.unassignedTasks.pending;
  const opsClear = reviewsClear && unassignedPending === 0;
  const opsLines = [
    reviewsClear
      ? null
      : summary.reviews.needsAttention === 1
        ? '1 reseña necesita atención'
        : `${summary.reviews.needsAttention} reseñas necesitan atención`,
    unassignedPending > 0
      ? `Tareas sin asignar: ${unassignedPending}`
      : null,
  ].filter((line): line is string => Boolean(line));
  const inventoryLines = [
    countLine('Esperando entrega', summary.inventory.waitingDelivery),
    countLine('Reordenar', summary.inventory.reorder),
    countLine('Stock bajo', summary.inventory.lowStock),
  ].filter((line): line is string => Boolean(line));

  const dayMonth = formatDayMonth(summary.date);
  const heading = dayMonth
    ? `:spiral_calendar_pad: ${dayMonth} Resumen`
    : ':spiral_calendar_pad: Resumen';

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: heading },
    },
    section(
      'Limpieza',
      cleaningLines.length
        ? cleaningLines
        : ['Yalla! No hay ninguna advertencia de limpieza'],
    ),
    section(
      'Mantenimiento',
      maintenanceLines.length
        ? maintenanceLines
        : ['Yalla! No hay ninguna advertencia de mantenimiento'],
    ),
    section(
      'Ops',
      opsClear
        ? ['Yalla! No hay nada pendiente en Ops']
        : opsLines,
    ),
    section(
      'Inventario',
      inventoryLines.length
        ? inventoryLines
        : ['Yalla! No hay ninguna advertencia de inventario'],
    ),
  ];
};

const postToResponseUrl = async (
  responseUrl: string,
  payload: Record<string, unknown>,
) => {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack response_url failed (${response.status}): ${text}`);
  }
};

export const handler = async (event: SlackHoyEvent) => {
  const responseUrl = event.responseUrl?.trim();
  if (!responseUrl) {
    throw new Error('responseUrl is required.');
  }

  if (!(await isSlackNotificationEnabled(SLACK_NOTIFICATION_IDS.slackHoy))) {
    await postToResponseUrl(responseUrl, {
      response_type: 'ephemeral',
      replace_original: false,
      text: 'El resumen de hoy está deshabilitado en Yalla.',
    });
    return { ok: true, skipped: true };
  }

  try {
    const summary = await loadTodaySummary();
    await postToResponseUrl(responseUrl, {
      response_type: 'in_channel',
      replace_original: false,
      text: `:spiral_calendar_pad: ${formatDayMonth(summary.date)} Resumen`.trim(),
      blocks: todayBlocks(summary),
    });
  } catch (error) {
    await postToResponseUrl(responseUrl, {
      response_type: 'ephemeral',
      replace_original: false,
      text:
        error instanceof Error
          ? `No se pudo cargar el resumen de hoy: ${error.message}`
          : 'No se pudo cargar el resumen de hoy.',
    });
  }

  return { ok: true };
};
