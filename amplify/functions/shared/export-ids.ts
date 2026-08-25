import { parseBody } from './dynamo-http';

export const parseRequestedIds = (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  isBase64Encoded?: boolean;
}): string[] | null => {
  if (event.requestContext?.http?.method !== 'POST') {
    return null;
  }

  let raw = event.body ?? '';
  if (event.isBase64Encoded && raw) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }

  const parsed = parseBody<{ ids?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.ids)) {
    return null;
  }

  return parsed.ids
    .map((id) =>
      typeof id === 'string' || typeof id === 'number' ? String(id).trim() : '',
    )
    .filter((id) => id.length > 0 && id !== '—');
};
