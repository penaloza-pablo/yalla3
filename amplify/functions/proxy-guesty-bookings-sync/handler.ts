import {
  LOG_FEATURES,
  recordActivityLog,
} from '../shared/activity-log';
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
    if (upstream.ok) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, raw: text.slice(0, 500) }),
      };
    }
    return buildHttpResponse(502, {
      message: 'Upstream returned a non-JSON response.',
      details: text.slice(0, 500),
    });
  }
  if (!upstream.ok) {
    return buildHttpResponse(upstream.status, {
      message: 'Upstream Guesty bookings sync failed.',
      details: payload,
    });
  }
  return buildHttpResponse(200, payload);
};

export const handler = async (event: {
  headers?: Record<string, string | string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
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

  const upstreamBase = process.env.UPSTREAM_URL;
  if (!upstreamBase) {
    return buildHttpResponse(500, { message: 'UPSTREAM_URL is not configured.' });
  }

  const query = new URLSearchParams();
  const fromYmd = event.queryStringParameters?.fromYmd;
  const toYmd = event.queryStringParameters?.toYmd;
  const maxItems = event.queryStringParameters?.maxItems;
  if (fromYmd) query.set('fromYmd', fromYmd);
  if (toYmd) query.set('toYmd', toYmd);
  if (maxItems) query.set('maxItems', maxItems);
  const separator = upstreamBase.includes('?') ? '&' : '?';
  const upstreamUrl = query.toString()
    ? `${upstreamBase}${separator}${query.toString()}`
    : upstreamBase;

  try {
    const response = await proxyUpstream(upstreamUrl);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      await recordActivityLog(event, {
        feature: LOG_FEATURES.BOOKINGS,
        action: 'sync',
        summary: 'triggered a bookings sync from Guesty',
      });
    }
    return response;
  } catch (error) {
    return buildHttpResponse(502, {
      message: 'Failed to reach Guesty bookings sync upstream.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
