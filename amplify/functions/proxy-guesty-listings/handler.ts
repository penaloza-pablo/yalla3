import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';

const proxyUpstream = async (upstreamUrl: string) => {
  const upstream = await fetch(upstreamUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await upstream.text();
  let payload: Record<string, unknown>;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return buildHttpResponse(502, {
      message: 'Upstream returned non-JSON response.',
      details: text.slice(0, 500),
    });
  }
  if (!upstream.ok) {
    return buildHttpResponse(upstream.status, {
      message: 'Upstream Guesty listings request failed.',
      details: payload,
    });
  }
  return buildHttpResponse(200, payload);
};

export const handler = async (event: {
  headers?: Record<string, string | string[] | undefined>;
  requestContext?: { http?: { method?: string } };
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const upstreamUrl = process.env.UPSTREAM_URL;
  if (!upstreamUrl) {
    return buildHttpResponse(500, { message: 'UPSTREAM_URL is not configured.' });
  }

  try {
    return await proxyUpstream(upstreamUrl);
  } catch (error) {
    return buildHttpResponse(502, {
      message: 'Failed to reach Guesty listings upstream.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
