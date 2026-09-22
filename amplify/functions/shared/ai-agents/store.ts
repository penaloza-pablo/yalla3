import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { nowIso } from '../dynamo-http';
import { docClient } from '../visit-task-utils';
import { AGENT_CATALOG } from './catalog';
import type {
  AgentDefinition,
  AgentRunRecord,
} from './types';

const agentsTable = () => process.env.AGENTS_TABLE || '';
const runsTable = () => process.env.RUNS_TABLE || '';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asRunStatus = (
  value: unknown,
): AgentRunRecord['status'] | undefined => {
  if (value === 'running' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  return undefined;
};

const fromStoredAgent = (item: Record<string, unknown>): AgentDefinition => ({
  id: asString(item.id),
  name: asString(item.name),
  purpose: asString(item.purpose),
  instructions: asString(item.instructions),
  rules: Array.isArray(item.rules)
    ? item.rules.filter((entry): entry is string => typeof entry === 'string')
    : [],
  allowedTools: Array.isArray(item.allowedTools)
    ? item.allowedTools.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [],
  provider: asString(item.provider) === 'bedrock' ? 'bedrock' : 'openai',
  model: asString(item.model),
  schedule: {
    kind: asString((item.schedule as { kind?: string } | undefined)?.kind) ===
    'cron'
      ? 'cron'
      : 'manual',
    expression: asString(
      (item.schedule as { expression?: string } | undefined)?.expression,
    ) || undefined,
    timezone:
      asString(
        (item.schedule as { timezone?: string } | undefined)?.timezone,
      ) || undefined,
    description: asString(
      (item.schedule as { description?: string } | undefined)?.description,
    ),
  },
  coveragePolicy: {
    type:
      asString(
        (item.coveragePolicy as { type?: string } | undefined)?.type,
      ) === 'mention_in_output'
        ? 'mention_in_output'
        : 'tool_declared',
  },
  enabled: item.enabled !== false,
  catalogVersion: Number(item.catalogVersion) || 0,
});

export const seedAgents = async () => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  for (const agent of AGENT_CATALOG) {
    const existing = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: agent.id },
      }),
    );
    const previous = existing.Item as Record<string, unknown> | undefined;
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...agent,
          lastRunAt: previous?.lastRunAt,
          lastRunStatus: previous?.lastRunStatus,
          lastRunError: previous?.lastRunError,
          updatedAt: nowIso(),
        },
      }),
    );
  }
};

export const listAgents = async (): Promise<
  Array<AgentDefinition & Record<string, unknown>>
> => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  await seedAgents();
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items
    .map((item) => ({
      ...fromStoredAgent(item),
      lastRunAt: asString(item.lastRunAt) || undefined,
      lastRunStatus: asRunStatus(item.lastRunStatus),
      lastRunError: asString(item.lastRunError) || undefined,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
};

export const getAgent = async (id: string) => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  await seedAgents();
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
    }),
  );
  if (!result.Item) {
    return null;
  }
  const item = result.Item as Record<string, unknown>;
  return {
    ...fromStoredAgent(item),
    lastRunAt: asString(item.lastRunAt) || undefined,
    lastRunStatus: asRunStatus(item.lastRunStatus),
    lastRunError: asString(item.lastRunError) || undefined,
  };
};

export const putRun = async (run: AgentRunRecord) => {
  const tableName = runsTable();
  if (!tableName) {
    throw new Error('RUNS_TABLE is not configured.');
  }
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...run,
        sk: `${run.startedAt}#${run.runId}`,
      },
    }),
  );
};

export const touchAgentRun = async (
  agentId: string,
  patch: {
    lastRunAt: string;
    lastRunStatus: AgentRunRecord['status'];
    lastRunError?: string;
  },
) => {
  const tableName = agentsTable();
  if (!tableName) {
    return;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: agentId },
      UpdateExpression:
        'SET lastRunAt = :lastRunAt, lastRunStatus = :lastRunStatus, lastRunError = :lastRunError',
      ExpressionAttributeValues: {
        ':lastRunAt': patch.lastRunAt,
        ':lastRunStatus': patch.lastRunStatus,
        ':lastRunError': patch.lastRunError ?? '',
      },
    }),
  );
};

export const listRuns = async (agentId: string, limit = 40) => {
  const tableName = runsTable();
  if (!tableName) {
    throw new Error('RUNS_TABLE is not configured.');
  }
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'agentId = :agentId',
      ExpressionAttributeValues: { ':agentId': agentId },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(limit, 1), 100),
    }),
  );
  return ((result.Items as AgentRunRecord[]) ?? []).map((item) => {
    const record = { ...(item as AgentRunRecord & { sk?: string }) };
    delete record.sk;
    return record;
  });
};

export const getRun = async (agentId: string, runId: string) => {
  const runs = await listRuns(agentId, 100);
  return runs.find((run) => run.runId === runId) ?? null;
};
