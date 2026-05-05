const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const buildHttpResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
}) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const endpoint = process.env.EXTERNAL_PROPERTIES_URL;
  if (!endpoint) {
    return buildHttpResponse(500, {
      message: 'EXTERNAL_PROPERTIES_URL is not configured.',
    });
  }

  try {
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      return buildHttpResponse(502, {
        message: `External request failed (${response.status}).`,
        details: errorText,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return buildHttpResponse(200, payload);
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to fetch external properties.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
