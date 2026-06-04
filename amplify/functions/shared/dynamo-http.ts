export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
};

export const isHttpRequest = (event: {
  requestContext?: { http?: { method?: string } };
}) => Boolean(event.requestContext?.http?.method);

export const buildHttpResponse = (
  statusCode: number,
  payload: Record<string, unknown>,
) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const parseBody = <T>(body?: string): T | null => {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
};

export const normalizeStatus = (value?: string) =>
  value?.trim().toUpperCase() ?? '';

export const nowIso = () => new Date().toISOString();
