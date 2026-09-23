import { loadOpenAiSecret } from './openai-secret';
import type {
  LLMProvider,
  ProviderConversation,
  ProviderToolCall,
  ProviderToolSpec,
  ProviderTurn,
} from '../types';

type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

const MAX_OUTPUT_TOKENS = 900;

const toOpenAiTools = (tools: ProviderToolSpec[]) =>
  tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

const parseArguments = (raw?: string): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const toToolCalls = (calls: OpenAiToolCall[] | undefined): ProviderToolCall[] =>
  (calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: parseArguments(call.function.arguments),
  }));

const completeTurn = async (input: {
  model: string;
  messages: OpenAiMessage[];
  tools: ProviderToolSpec[];
}): Promise<{ turn: ProviderTurn; conversation: ProviderConversation }> => {
  const secret = await loadOpenAiSecret();
  if (!secret) {
    throw new Error('OpenAI credentials are not configured.');
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
      model: input.model,
      messages: input.messages,
      tools: input.tools.length > 0 ? toOpenAiTools(input.tools) : undefined,
      tool_choice: input.tools.length > 0 ? 'auto' : undefined,
      temperature: 0.8,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{
      message?: OpenAiMessage;
      finish_reason?: string;
    }>;
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `OpenAI request failed (${response.status}).`,
    );
  }
  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenAI returned an empty message.');
  }
  const messages = [...input.messages, message];
  const toolCalls = toToolCalls(message.tool_calls);
  const text = String(message.content ?? '').trim();
  return {
    turn: {
      text: toolCalls.length > 0 ? undefined : text,
      toolCalls,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
      finishReason: payload.choices?.[0]?.finish_reason,
    },
    conversation: { messages },
  };
};

const asMessages = (conversation: ProviderConversation): OpenAiMessage[] =>
  Array.isArray(conversation.messages)
    ? (conversation.messages as OpenAiMessage[])
    : [];

export const openaiProvider: LLMProvider = {
  id: 'openai',
  invoke: async (input) =>
    completeTurn({
      model: input.model,
      tools: input.tools,
      messages: [
        { role: 'system', content: input.instructions },
        { role: 'user', content: input.userMessage },
      ],
    }),
  continueWithToolResults: async (input) =>
    completeTurn({
      model: input.model,
      tools: input.tools,
      messages: [
        ...asMessages(input.conversation),
        ...input.results.map((result) => ({
          role: 'tool' as const,
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.content),
        })),
      ],
    }),
};
