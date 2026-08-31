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

const GOOD_JOB = 'Good job! All task completed';

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

const ratio = (done: number, total: number) => `${done} de ${total}`;

const todayBlocks = (summary: TodaySummary) => {
  const cleaningDone =
    summary.cleaning.planningReady === summary.cleaning.planningTotal &&
    summary.cleaning.currentCompleted === summary.cleaning.currentTotal &&
    summary.cleaning.previousOpen === 0;
  const maintenanceDone =
    summary.maintenance.currentCompleted === summary.maintenance.currentTotal &&
    summary.maintenance.previousOpen === 0;
  const reviewsDone = summary.reviews.needsAttention === 0;
  const inventoryDone =
    summary.inventory.waitingDelivery === 0 &&
    summary.inventory.reorder === 0 &&
    summary.inventory.lowStock === 0;

  const section = (title: string, lines: string[]) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${title}*\n${lines.join('\n')}`,
    },
  });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Hoy ${summary.date ?? ''}`.trim() },
    },
    section(
      'Cleaning',
      cleaningDone
        ? [GOOD_JOB]
        : [
            `Planning: ${ratio(summary.cleaning.planningReady, summary.cleaning.planningTotal)}`,
            `Current cleanings: ${ratio(summary.cleaning.currentCompleted, summary.cleaning.currentTotal)}`,
            `Previous cleanings: ${summary.cleaning.previousOpen}`,
          ],
    ),
    section(
      'Maintenance',
      maintenanceDone
        ? [GOOD_JOB]
        : [
            `Current maintenance: ${ratio(summary.maintenance.currentCompleted, summary.maintenance.currentTotal)}`,
            `To estimate: ${summary.maintenance.previousOpen}`,
          ],
    ),
    section(
      'Reviews',
      reviewsDone
        ? [GOOD_JOB]
        : [
            summary.reviews.needsAttention === 1
              ? '1 review needs attention'
              : `${summary.reviews.needsAttention} reviews need attention`,
          ],
    ),
    section(
      'Inventory',
      inventoryDone
        ? [GOOD_JOB]
        : [
            `Waiting delivery: ${summary.inventory.waitingDelivery}`,
            `Reorder: ${summary.inventory.reorder}`,
            `Low stock: ${summary.inventory.lowStock}`,
          ],
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
      text: `Resumen de hoy ${summary.date ?? ''}`.trim(),
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
