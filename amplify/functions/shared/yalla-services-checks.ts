import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda';
import { loadGuestyClient } from './guesty-client';
import { slackApi } from './slack';

const lambda = new LambdaClient({});
const dynamo = new DynamoDBClient({});

export type ServiceCheckResult = {
  ok: boolean;
  error?: string;
  detail?: string;
};

export type LambdaWebhookCheckInput = {
  state?: string;
  lastUpdateStatus?: string;
  functionError?: string;
  statusCode?: number;
  bodyText?: string;
  healthyBodySnippets?: string[];
};

export const expectedWebhookProbeBody = 'Missing ReservationID';

export const HEALTHY_WEBHOOK_SNIPPETS = [
  'Missing ReservationID',
  'Missing GuestyTaskID',
  'Body is required',
  'bad sig',
];

const asText = (value: unknown) => String(value ?? '').trim();

export const classifyFunctionConfiguration = (input: {
  state?: string;
  lastUpdateStatus?: string;
}): ServiceCheckResult => {
  const state = asText(input.state);
  if (state && state !== 'Active') {
    return {
      ok: false,
      error: `Lambda state is ${state}.`,
      detail: `lastUpdateStatus=${input.lastUpdateStatus ?? ''}`,
    };
  }
  const update = asText(input.lastUpdateStatus);
  if (update && update !== 'Successful') {
    return {
      ok: false,
      error: `Lambda last update is ${update}.`,
      detail: `state=${state || 'unknown'}`,
    };
  }
  return { ok: true };
};

const isInitFailure = (functionError?: string, bodyText?: string) => {
  const detail = `${functionError ?? ''} ${bodyText ?? ''}`;
  return /cannot find module|Runtime\.ImportModuleError|Init Error/i.test(detail);
};

export const classifyLambdaWebhookHealth = (
  input: LambdaWebhookCheckInput,
): ServiceCheckResult => {
  const config = classifyFunctionConfiguration(input);
  if (!config.ok) {
    return config;
  }
  if (input.functionError) {
    const detail = asText(input.bodyText);
    return {
      ok: false,
      error: isInitFailure(input.functionError, detail)
        ? 'Lambda does not start (missing module).'
        : `Lambda invoke error: ${input.functionError}.`,
      detail: detail.slice(0, 500) || input.functionError,
    };
  }
  const snippets = input.healthyBodySnippets?.length
    ? input.healthyBodySnippets
    : HEALTHY_WEBHOOK_SNIPPETS;
  const body = input.bodyText ?? '';
  if (
    input.statusCode === 400 &&
    snippets.some((snippet) => body.includes(snippet))
  ) {
    return {
      ok: true,
      detail: 'Webhook handler booted and rejected the probe payload.',
    };
  }
  if (input.statusCode === 401) {
    return {
      ok: true,
      detail: 'Webhook handler booted and rejected the probe as unauthorized.',
    };
  }
  if (input.statusCode == null) {
    return { ok: false, error: 'Lambda returned no status code.' };
  }
  return {
    ok: false,
    error: `Unexpected webhook probe response (${input.statusCode}).`,
    detail: String(input.bodyText ?? '').slice(0, 500),
  };
};

export const classifyLambdaBootHealth = (input: {
  state?: string;
  lastUpdateStatus?: string;
  functionError?: string;
  bodyText?: string;
}): ServiceCheckResult => {
  const config = classifyFunctionConfiguration(input);
  if (!config.ok) {
    return config;
  }
  if (!input.functionError) {
    return { ok: true, detail: 'Lambda is Active and the probe invoke returned.' };
  }
  const detail = asText(input.bodyText);
  if (isInitFailure(input.functionError, detail)) {
    return {
      ok: false,
      error: 'Lambda does not start (missing module).',
      detail: detail.slice(0, 500) || input.functionError,
    };
  }
  return {
    ok: true,
    detail: 'Lambda booted and returned an application error for the empty probe.',
  };
};

const decodePayload = (payload: Uint8Array | undefined) => {
  if (!payload) {
    return '';
  }
  return Buffer.from(payload).toString('utf8');
};

const probeEvent = () => ({
  requestContext: { http: { method: 'POST' } },
  httpMethod: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

const invokeProbe = async (functionName: string, payload: unknown) => {
  const invoked = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  return {
    functionError: invoked.FunctionError,
    bodyText: decodePayload(invoked.Payload),
  };
};

const parseHttpPayload = (bodyText: string) => {
  try {
    const parsed = JSON.parse(bodyText) as { statusCode?: number; body?: unknown };
    const statusCode =
      typeof parsed.statusCode === 'number' ? parsed.statusCode : undefined;
    const nested =
      typeof parsed.body === 'string'
        ? parsed.body
        : parsed.body != null
          ? JSON.stringify(parsed.body)
          : bodyText;
    return { statusCode, bodyText: nested };
  } catch {
    return { statusCode: undefined, bodyText };
  }
};

export const checkLambdaWebhookReceiver = async (
  functionName: string,
  options?: { healthyBodySnippets?: string[] },
) => {
  const name = functionName.trim();
  if (!name) {
    return { ok: false as const, error: 'Lambda function name is not configured.' };
  }
  try {
    const config = await lambda.send(
      new GetFunctionConfigurationCommand({ FunctionName: name }),
    );
    const invoked = await invokeProbe(name, probeEvent());
    const parsed = parseHttpPayload(invoked.bodyText);
    return classifyLambdaWebhookHealth({
      state: config.State,
      lastUpdateStatus: config.LastUpdateStatus,
      functionError: invoked.functionError,
      statusCode: parsed.statusCode,
      bodyText: parsed.bodyText,
      healthyBodySnippets: options?.healthyBodySnippets,
    });
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const checkLambdaConfiguration = async (functionName: string) => {
  const name = functionName.trim();
  if (!name) {
    return { ok: false as const, error: 'Lambda function name is not configured.' };
  }
  try {
    const config = await lambda.send(
      new GetFunctionConfigurationCommand({ FunctionName: name }),
    );
    const result = classifyFunctionConfiguration({
      state: config.State,
      lastUpdateStatus: config.LastUpdateStatus,
    });
    return result.ok
      ? { ok: true, detail: `Lambda ${name} is Active.` }
      : result;
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const checkLambdaBoots = async (functionName: string) => {
  const name = functionName.trim();
  if (!name) {
    return { ok: false as const, error: 'Lambda function name is not configured.' };
  }
  try {
    const config = await lambda.send(
      new GetFunctionConfigurationCommand({ FunctionName: name }),
    );
    const invoked = await invokeProbe(name, {});
    return classifyLambdaBootHealth({
      state: config.State,
      lastUpdateStatus: config.LastUpdateStatus,
      functionError: invoked.functionError,
      bodyText: invoked.bodyText,
    });
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const classifyGuestyOpenApiHealth = (input: {
  available: boolean;
  itemCount?: number;
  error?: string;
}): ServiceCheckResult => {
  if (!input.available) {
    return { ok: false, error: 'Guesty client layer is not available.' };
  }
  if (input.error) {
    return { ok: false, error: input.error };
  }
  return {
    ok: true,
    detail:
      typeof input.itemCount === 'number'
        ? `Guesty Open API responded (${input.itemCount} listings in probe).`
        : 'Guesty Open API responded.',
  };
};

const listingCount = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload.length;
  }
  if (!payload || typeof payload !== 'object') {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  for (const key of ['results', 'data', 'listings', 'items']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested.length;
    }
  }
  return Object.keys(record).length > 0 ? 1 : 0;
};

export const checkGuestyOpenApi = async (): Promise<ServiceCheckResult> => {
  try {
    const client = await loadGuestyClient();
    if (!client) {
      return classifyGuestyOpenApiHealth({ available: false });
    }
    const payload = await client.guestyGet('/v1/listings?limit=1');
    return classifyGuestyOpenApiHealth({
      available: true,
      itemCount: listingCount(payload),
    });
  } catch (error) {
    return classifyGuestyOpenApiHealth({
      available: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const checkSlackBot = async (): Promise<ServiceCheckResult> => {
  try {
    await slackApi('auth.test', {});
    return { ok: true, detail: 'Slack auth.test succeeded.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const classifyDynamoTableHealth = (
  tables: Array<{ name: string; status?: string; error?: string }>,
): ServiceCheckResult => {
  const failed = tables.filter(
    (table) => table.error || (table.status && table.status !== 'ACTIVE'),
  );
  if (failed.length === 0) {
    return {
      ok: true,
      detail: `${tables.length} operational tables are ACTIVE.`,
    };
  }
  return {
    ok: false,
    error: failed
      .map(
        (table) =>
          `${table.name}: ${table.error || table.status || 'unknown'}`,
      )
      .join('; '),
  };
};

export const defaultOpsTables = () =>
  (process.env.OPS_TABLES || 'yalla-bookings,yalla-visits,yalla-tasks,yalla-properties')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

export const checkDynamoOpsTables = async (
  tableNames = defaultOpsTables(),
): Promise<ServiceCheckResult> => {
  if (tableNames.length === 0) {
    return { ok: false, error: 'OPS_TABLES is not configured.' };
  }
  const tables = await Promise.all(
    tableNames.map(async (name) => {
      try {
        const result = await dynamo.send(
          new DescribeTableCommand({ TableName: name }),
        );
        return { name, status: result.Table?.TableStatus };
      } catch (error) {
        return {
          name,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return classifyDynamoTableHealth(tables);
};
