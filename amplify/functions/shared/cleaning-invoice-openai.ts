import { loadOpenAiSecret } from './ai-agents/providers/openai-secret';

const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const looksLikeInvoiceText = (text: string) =>
  /n[uú]mero\s*:/i.test(text) ||
  /\barticulo\b/i.test(text) ||
  /\bsubtotal\b/i.test(text);

export const extractInvoiceTextWithOpenAi = async (bytes: Buffer) => {
  const secret = await loadOpenAiSecret();
  if (!secret) {
    return '';
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret.apiKey}`,
    'content-type': 'application/json',
  };
  if (secret.organization) {
    headers['openai-organization'] = secret.organization;
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content:
            'Extract all visible text from this Spanish cleaning invoice. Return plain text only, preserving line items, CIF, dates and subtotals.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'invoice.pdf',
                file_data: `data:application/pdf;base64,${bytes.toString('base64')}`,
              },
            },
          ],
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `OpenAI invoice OCR failed (${response.status}).`,
    );
  }
  return asText(payload.choices?.[0]?.message?.content);
};
