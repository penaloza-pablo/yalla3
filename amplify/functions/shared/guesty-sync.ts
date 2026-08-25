import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({});

export type GuestySyncResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type GuestyRefreshResult = GuestySyncResult & {
  changed?: boolean;
  item?: Record<string, unknown>;
  yallaStatus?: string;
  guestyStatus?: string;
};

const parseLambdaPayload = (payloadText: string) => {
  const parsed = JSON.parse(payloadText) as {
    error?: string;
    body?: string;
    skipped?: boolean;
    changed?: boolean;
    item?: Record<string, unknown>;
    yallaStatus?: string;
    guestyStatus?: string;
  };
  return (
    typeof parsed.body === 'string' ? JSON.parse(parsed.body) : parsed
  ) as {
    error?: string;
    skipped?: boolean;
    changed?: boolean;
    item?: Record<string, unknown>;
    yallaStatus?: string;
    guestyStatus?: string;
  };
};

export const hasGuestyTaskId = (item: Record<string, unknown>) =>
  typeof item.guestyTaskId === 'string' && Boolean(item.guestyTaskId.trim());

export const invokeGuestyTaskSync = async (options: {
  tableName: string;
  id: string;
}): Promise<GuestySyncResult> => {
  const functionName = process.env.SYNC_TASK_TO_GUESTY_FUNCTION;
  if (!functionName) {
    return { ok: false, error: 'SYNC_TASK_TO_GUESTY_FUNCTION is not configured.' };
  }

  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(
        JSON.stringify({
          tableName: options.tableName,
          id: options.id,
        }),
      ),
    }),
  );

  const payloadText = response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';
  if (response.FunctionError) {
    return {
      ok: false,
      error: payloadText || response.FunctionError,
    };
  }

  if (payloadText) {
    try {
      const body = parseLambdaPayload(payloadText);
      if (body?.error) {
        return { ok: false, error: String(body.error) };
      }
      return { ok: true, skipped: Boolean(body?.skipped) };
    } catch {
      return { ok: true };
    }
  }

  return { ok: true };
};

export const invokeGuestyTaskRefresh = async (options: {
  tableName: string;
  id: string;
}): Promise<GuestyRefreshResult> => {
  const functionName = process.env.SYNC_TASK_TO_GUESTY_FUNCTION;
  if (!functionName) {
    return { ok: false, error: 'SYNC_TASK_TO_GUESTY_FUNCTION is not configured.' };
  }

  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(
        JSON.stringify({
          tableName: options.tableName,
          id: options.id,
          action: 'refreshFromGuesty',
        }),
      ),
    }),
  );

  const payloadText = response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';
  if (response.FunctionError) {
    return {
      ok: false,
      error: payloadText || response.FunctionError,
    };
  }

  if (payloadText) {
    try {
      const body = parseLambdaPayload(payloadText);
      if (body?.error) {
        return { ok: false, error: String(body.error) };
      }
      return {
        ok: true,
        changed: Boolean(body?.changed),
        item: body?.item,
        yallaStatus:
          typeof body?.yallaStatus === 'string' ? body.yallaStatus : undefined,
        guestyStatus:
          typeof body?.guestyStatus === 'string' ? body.guestyStatus : undefined,
      };
    } catch {
      return { ok: false, error: payloadText || 'Invalid refresh response.' };
    }
  }

  return { ok: false, error: 'Empty refresh response.' };
};
