import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({});

export type GuestySyncResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
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
      const parsed = JSON.parse(payloadText) as {
        error?: string;
        body?: string;
        skipped?: boolean;
      };
      const body =
        typeof parsed.body === 'string' ? JSON.parse(parsed.body) : parsed;
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
