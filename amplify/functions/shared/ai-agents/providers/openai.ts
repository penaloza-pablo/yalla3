import { nowIso } from '../../dynamo-http';
import { loadOpenAiSecret } from './openai-secret';
import type {
  AgentTool,
  ProviderInvokeInput,
  ProviderInvokeResult,
  ToolCoverageHint,
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

const MAX_TURNS = 8;
const MAX_OUTPUT_TOKENS = 900;
const summarize = (value: unknown, max = 400) => {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
};

const toOpenAiTools = (tools: AgentTool[]) =>
  tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

export const invokeOpenAi = async (
  input: ProviderInvokeInput,
): Promise<ProviderInvokeResult> => {
  const secret = await loadOpenAiSecret();
  if (!secret) {
    throw new Error('OpenAI credentials are not configured.');
  }

  const messages: OpenAiMessage[] = [
    { role: 'system', content: input.instructions },
    { role: 'user', content: input.userMessage },
  ];
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const events: ProviderInvokeResult['events'] = [];
  const toolCoverage: ToolCoverageHint[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let text = '';

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
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
        messages,
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
    inputTokens += payload.usage?.prompt_tokens ?? 0;
    outputTokens += payload.usage?.completion_tokens ?? 0;
    const message = payload.choices?.[0]?.message;
    if (!message) {
      throw new Error('OpenAI returned an empty message.');
    }
    messages.push(message);
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      text = String(message.content ?? '').trim();
      events.push({
        at: nowIso(),
        type: 'model',
        name: input.model,
        outputSummary: summarize(text, 240),
      });
      break;
    }

    events.push({
      at: nowIso(),
      type: 'model',
      name: input.model,
      outputSummary: `Requested ${toolCalls.length} tool call(s).`,
    });

    for (const call of toolCalls) {
      const tool = toolsByName.get(call.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        args = {};
      }
      if (!tool) {
        const error = `Tool ${call.function.name} is not allowed for this agent.`;
        events.push({
          at: nowIso(),
          type: 'error',
          name: call.function.name,
          error,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error }),
        });
        continue;
      }
      try {
        const result = await tool.execute(args);
        if (result.coverage) {
          toolCoverage.push(result.coverage);
        }
        events.push({
          at: nowIso(),
          type: 'tool',
          name: tool.name,
          inputSummary: summarize(args, 200),
          outputSummary: summarize(result.content, 400),
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.content),
        });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        events.push({
          at: nowIso(),
          type: 'error',
          name: tool.name,
          error: messageText,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: messageText }),
        });
      }
    }
  }

  if (!text) {
    throw new Error('The model did not return a final answer.');
  }

  return {
    text,
    events,
    toolCoverage,
    usage: { inputTokens, outputTokens },
  };
};
