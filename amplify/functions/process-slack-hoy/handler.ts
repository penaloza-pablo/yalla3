import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

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
  if (!body.cleaning || !body.maintenance || !body.reviews || !body.inventory) {
    throw new Error(body.message || 'Today summary payload is incomplete.');
  }
  return body as TodaySummary;
};

const formatDayMonth = (date?: string) => {
  const match = date?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return date?.trim() || '';
  }
  return `${match[3]}/${match[2]}`;
};

const ratio = (done: number, total: number) => `${done} de ${total}`;

const ratioLine = (
  label: string,
  done: number,
  total: number,
  incompletePrefix?: string,
) => {
  const complete = done === total;
  const value = complete
    ? ratio(done, total)
    : `${incompletePrefix ?? ''}${ratio(done, total)}`;
  return complete
    ? `:white_check_mark: ${label}: ${value}`
    : `${label}: ${value}`;
};

const countLine = (label: string, count: number) =>
  count === 0
    ? `:white_check_mark: ${label}: 0`
    : `${label}: ${count}`;

const section = (title: string, lines: string[]) => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: `*${title}*\n${lines.join('\n')}`,
  },
});

const todayBlocks = (summary: TodaySummary) => {
  const cleaningClear =
    summary.cleaning.planningReady === summary.cleaning.planningTotal &&
    summary.cleaning.currentCompleted === summary.cleaning.currentTotal &&
    summary.cleaning.previousOpen === 0;
  const maintenanceClear =
    summary.maintenance.currentCompleted === summary.maintenance.currentTotal &&
    summary.maintenance.previousOpen === 0;
  const reviewsClear = summary.reviews.needsAttention === 0;
  const inventoryClear =
    summary.inventory.waitingDelivery === 0 &&
    summary.inventory.reorder === 0 &&
    summary.inventory.lowStock === 0;

  const dayMonth = formatDayMonth(summary.date);
  const heading = dayMonth
    ? `:spiral_calendar_pad: ${dayMonth} Resumen`
    : ':spiral_calendar_pad: Resumen';

  const inventoryLines = [
    summary.inventory.waitingDelivery > 0
      ? `Esperando entrega: ${summary.inventory.waitingDelivery}`
      : null,
    summary.inventory.reorder > 0
      ? `Reordenar: ${summary.inventory.reorder}`
      : null,
    summary.inventory.lowStock > 0
      ? `Stock bajo: ${summary.inventory.lowStock}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: heading },
    },
    section(
      'Limpieza',
      cleaningClear
        ? ['Yalla! No hay ninguna advertencia de limpieza']
        : [
            ratioLine(
              'Planificación',
              summary.cleaning.planningReady,
              summary.cleaning.planningTotal,
              'pendiente ',
            ),
            ratioLine(
              'Limpiezas del día',
              summary.cleaning.currentCompleted,
              summary.cleaning.currentTotal,
            ),
            countLine('Retrasadas por cerrar', summary.cleaning.previousOpen),
          ],
    ),
    section(
      'Mantenimiento',
      maintenanceClear
        ? ['Yalla! No hay ninguna advertencia de mantenimiento']
        : [
            ratioLine(
              'Mantenimientos del día',
              summary.maintenance.currentCompleted,
              summary.maintenance.currentTotal,
              'pendiente ',
            ),
            countLine(
              'Pendientes de estimar',
              summary.maintenance.previousOpen,
            ),
          ],
    ),
    section(
      'Reseñas',
      reviewsClear
        ? ['Yalla! No hay ninguna reseña que atender']
        : [
            summary.reviews.needsAttention === 1
              ? '1 reseña necesita atención'
              : `${summary.reviews.needsAttention} reseñas necesitan atención`,
          ],
    ),
    section(
      'Inventario',
      inventoryClear
        ? ['Yalla! No hay ninguna advertencia de inventario']
        : inventoryLines,
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
