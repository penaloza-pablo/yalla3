import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { nowIso } from '../dynamo-http';
import { docClient } from '../visit-task-utils';
import { slugifyAgentId } from './agent-config';
import { AGENT_CATALOG } from './catalog';
import { agentVersionId, isAgentHeadId, isToolHeadId, toolHeadId, toolVersionId } from './ids';
import { clampRuntimeLimits, DEFAULT_RUNTIME_LIMITS, TOOL_DEBUG_AGENT_ID } from './limits';
import { listPublicTools } from './tools/registry';
import type {
  AgentDefinition,
  AgentRunRecord,
  AgentRunStatus,
  AgentToolPublic,
  AgentVersionRecord,
  ApprovalPolicy,
  CoveragePolicy,
  MemoryPolicy,
  PermissionPolicy,
  RuntimeLimits,
  ToolVersionRecord,
} from './types';

const agentsTable = () => process.env.AGENTS_TABLE || '';
const runsTable = () => process.env.RUNS_TABLE || '';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const asRunStatus = (value: unknown): AgentRunStatus | undefined => {
  if (
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'waiting_for_approval' ||
    value === 'timed_out' ||
    value === 'cost_limit' ||
    value === 'max_turns'
  ) {
    return value;
  }
  return undefined;
};

const coverageFromStored = (item: Record<string, unknown>): CoveragePolicy => {
  const type =
    asString((item.coveragePolicy as { type?: string } | undefined)?.type) ===
    'mention_in_output'
      ? 'mention_in_output'
      : 'tool_declared';
  const parsed = Number(
    (item.coveragePolicy as { expectedParagraphs?: unknown } | undefined)
      ?.expectedParagraphs,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? { type, expectedParagraphs: parsed }
    : { type };
};

const fromStoredAgent = (item: Record<string, unknown>): AgentDefinition => {
  const allowedTools = asStringList(item.allowedTools);
  const runtimeLimits = clampRuntimeLimits(
    item.runtimeLimits as Partial<RuntimeLimits> | undefined,
  );
  const approvalPolicy: ApprovalPolicy = {
    requireApprovalFor: asStringList(
      (item.approvalPolicy as { requireApprovalFor?: unknown } | undefined)
        ?.requireApprovalFor,
    ),
  };
  const permissionPolicy: PermissionPolicy = {
    allowedTools:
      asStringList(
        (item.permissionPolicy as { allowedTools?: unknown } | undefined)
          ?.allowedTools,
      ).length > 0
        ? asStringList(
            (item.permissionPolicy as { allowedTools?: unknown } | undefined)
              ?.allowedTools,
          )
        : allowedTools,
  };
  const memoryPolicy: MemoryPolicy = { kind: 'none' };
  const publishedVersionRaw = Number(item.publishedVersion);
  const draftVersion = Number(item.draftVersion) || 1;
  const status =
    asString(item.status) === 'archived'
      ? 'archived'
      : asString(item.status) === 'published' || publishedVersionRaw > 0
        ? 'published'
        : 'draft';
  return {
    id: asString(item.id),
    name: asString(item.name),
    purpose: asString(item.purpose),
    instructions: asString(item.instructions),
    rules: asStringList(item.rules),
    allowedTools,
    provider: asString(item.provider) === 'bedrock' ? 'bedrock' : 'openai',
    model: asString(item.model),
    schedule: {
      kind:
        asString((item.schedule as { kind?: string } | undefined)?.kind) ===
        'cron'
          ? 'cron'
          : 'manual',
      expression:
        asString(
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
    coveragePolicy: coverageFromStored(item),
    enabled: item.enabled !== false,
    catalogVersion: Number(item.catalogVersion) || 0,
    status,
    draftVersion,
    publishedVersion:
      Number.isInteger(publishedVersionRaw) && publishedVersionRaw > 0
        ? publishedVersionRaw
        : undefined,
    createdAt: asString(item.createdAt) || undefined,
    updatedAt: asString(item.updatedAt) || undefined,
    publishedAt: asString(item.publishedAt) || undefined,
    runtimeLimits: runtimeLimits.timeoutMs
      ? runtimeLimits
      : DEFAULT_RUNTIME_LIMITS,
    memoryPolicy,
    permissionPolicy,
    approvalPolicy,
    knowledgeSources: asStringList(item.knowledgeSources),
  };
};

const withoutUndefined = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(withoutUndefined).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const cleaned = withoutUndefined(entry);
      if (cleaned !== undefined) {
        next[key] = cleaned;
      }
    }
    return next;
  }
  return value;
};

const getItem = async (id: string) => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

const putItem = async (item: Record<string, unknown>) => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: withoutUndefined(item) as Record<string, unknown>,
    }),
  );
};

const snapshotFromDefinition = (
  agent: AgentDefinition,
  version: number,
): AgentVersionRecord => ({
  ...agent,
  id: agentVersionId(agent.id, version),
  recordType: 'agent-version',
  agentId: agent.id,
  version,
  status: 'published',
  draftVersion: version,
  publishedVersion: version,
});

const writeAgentSnapshot = async (agent: AgentDefinition, version: number) => {
  const snapshot = snapshotFromDefinition(agent, version);
  await putItem({
    ...snapshot,
    updatedAt: nowIso(),
  });
};

const ensureAgentVersioning = async (
  item: Record<string, unknown>,
  agent: AgentDefinition,
) => {
  if (item.draftVersion && item.publishedVersion) {
    return agent;
  }
  const version = Number(item.draftVersion) || 1;
  const publishedAt = asString(item.publishedAt) || asString(item.updatedAt) || nowIso();
  const next: AgentDefinition = {
    ...agent,
    status: 'published',
    draftVersion: version,
    publishedVersion: version,
    createdAt: agent.createdAt || asString(item.updatedAt) || nowIso(),
    publishedAt,
  };
  await putItem({
    ...item,
    ...next,
    recordType: 'agent',
    updatedAt: nowIso(),
  });
  const existingSnapshot = await getItem(agentVersionId(agent.id, version));
  if (!existingSnapshot) {
    await writeAgentSnapshot(next, version);
  }
  return next;
};

export const seedAgents = async () => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
  for (const agent of AGENT_CATALOG) {
    const existing = await getItem(agent.id);
    if (existing) {
      await ensureAgentVersioning(existing, {
        ...fromStoredAgent(existing),
        id: agent.id,
      });
      continue;
    }
    const createdAt = nowIso();
    await putItem({
      ...agent,
      recordType: 'agent',
      createdAt,
      updatedAt: createdAt,
      publishedAt: createdAt,
    });
    await writeAgentSnapshot({ ...agent, createdAt, publishedAt: createdAt }, 1);
  }
};

export const seedTools = async () => {
  for (const tool of listPublicTools()) {
    const headKey = toolHeadId(tool.name);
    const existing = await getItem(headKey);
    const version = tool.catalogVersion;
    if (!existing) {
      const createdAt = nowIso();
      await putItem({
        ...tool,
        id: headKey,
        recordType: 'tool',
        version,
        createdAt,
        updatedAt: createdAt,
      });
      await putItem({
        ...tool,
        id: toolVersionId(tool.name, version),
        recordType: 'tool-version',
        version,
        createdAt,
      });
      continue;
    }
    const storedVersion = Number(existing.catalogVersion) || 0;
    if (storedVersion >= version) {
      continue;
    }
    await putItem({
      ...existing,
      ...tool,
      id: headKey,
      recordType: 'tool',
      version,
      updatedAt: nowIso(),
    });
    await putItem({
      ...tool,
      id: toolVersionId(tool.name, version),
      recordType: 'tool-version',
      version,
      createdAt: nowIso(),
    });
  }
};

const scanTable = async () => {
  const tableName = agentsTable();
  if (!tableName) {
    throw new Error('AGENTS_TABLE is not configured.');
  }
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
  return items;
};

export const listAgents = async (): Promise<
  Array<AgentDefinition & Record<string, unknown>>
> => {
  await seedAgents();
  await seedTools();
  const items = await scanTable();
  return items
    .filter((item) => isAgentHeadId(asString(item.id)))
    .map((item) => ({
      ...fromStoredAgent(item),
      lastRunAt: asString(item.lastRunAt) || undefined,
      lastRunStatus: asRunStatus(item.lastRunStatus),
      lastRunError: asString(item.lastRunError) || undefined,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
};

export const getAgent = async (id: string) => {
  await seedAgents();
  const item = await getItem(id);
  if (!item || !isAgentHeadId(id)) {
    return null;
  }
  const migrated = await ensureAgentVersioning(item, fromStoredAgent(item));
  return {
    ...migrated,
    lastRunAt: asString(item.lastRunAt) || undefined,
    lastRunStatus: asRunStatus(item.lastRunStatus),
    lastRunError: asString(item.lastRunError) || undefined,
  };
};

const getAgentRecord = async (id: string) => getItem(id);

export const allocateAgentId = async (name: string) => {
  const base = slugifyAgentId(name);
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await getAgentRecord(candidate);
    if (!existing) {
      return candidate;
    }
    candidate = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return crypto.randomUUID();
};

export const putAgent = async (agent: AgentDefinition) => {
  const previous = await getAgentRecord(agent.id);
  const createdAt = asString(previous?.createdAt) || agent.createdAt || nowIso();
  const item = withoutUndefined({
    ...agent,
    recordType: 'agent',
    createdAt,
    lastRunAt: previous?.lastRunAt,
    lastRunStatus: previous?.lastRunStatus,
    lastRunError: previous?.lastRunError,
    updatedAt: nowIso(),
  });
  await putItem(item as Record<string, unknown>);
};

export const getAgentVersion = async (agentId: string, version: number) => {
  const item = await getItem(agentVersionId(agentId, version));
  if (!item) {
    return null;
  }
  const stored = fromStoredAgent({ ...item, id: agentId });
  return {
    ...stored,
    publishedVersion: version,
    draftVersion: version,
    status: 'published' as const,
  };
};

export const listAgentVersions = async (agentId: string) => {
  const items = await scanTable();
  const prefix = `${agentId}::v`;
  return items
    .filter((item) => asString(item.id).startsWith(prefix))
    .map((item) => {
      const version = Number(asString(item.id).slice(prefix.length)) || 0;
      const definition = fromStoredAgent({ ...item, id: agentId });
      return {
        version,
        publishedAt: definition.publishedAt || definition.updatedAt,
        name: definition.name,
        model: definition.model,
        provider: definition.provider,
        allowedTools: definition.allowedTools,
      };
    })
    .sort((left, right) => right.version - left.version);
};

export const publishAgent = async (agentId: string) => {
  const current = await getAgent(agentId);
  if (!current) {
    return null;
  }
  const version = current.draftVersion;
  const publishedAt = nowIso();
  const published: AgentDefinition = {
    ...current,
    status: 'published',
    publishedVersion: version,
    publishedAt,
  };
  await writeAgentSnapshot(published, version);
  await putAgent(published);
  return published;
};

export const listStoredTools = async (): Promise<
  Array<AgentToolPublic & { version: number; createdAt?: string; updatedAt?: string }>
> => {
  await seedTools();
  const codeTools = listPublicTools();
  const items = await scanTable();
  const byName = new Map(
    items
      .filter((item) => isToolHeadId(asString(item.id)))
      .map((item) => [asString(item.name) || asString(item.id), item]),
  );
  return codeTools.map((tool) => {
    const stored = byName.get(tool.name);
    return {
      ...tool,
      version: Number(stored?.version) || tool.catalogVersion,
      createdAt: asString(stored?.createdAt) || undefined,
      updatedAt: asString(stored?.updatedAt) || undefined,
    };
  });
};

export const listToolVersions = async (name: string) => {
  const items = await scanTable();
  return items
    .filter((item) => asString(item.id).startsWith(`tool::${name}::v`))
    .map((item) => {
      const version = Number(asString(item.id).split('::v')[1]) || 0;
      return {
        version,
        name,
        description: asString(item.description),
        catalogVersion: Number(item.catalogVersion) || version,
        createdAt: asString(item.createdAt) || undefined,
        riskLevel: asString(item.riskLevel) || 'read',
      } satisfies Partial<ToolVersionRecord> & { version: number; name: string };
    })
    .sort((left, right) => right.version - left.version);
};

export const putRun = async (run: AgentRunRecord) => {
  const tableName = runsTable();
  if (!tableName) {
    throw new Error('RUNS_TABLE is not configured.');
  }
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: withoutUndefined({
        ...run,
        sk: `${run.startedAt}#${run.runId}`,
      }) as Record<string, unknown>,
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
  if (agentId === TOOL_DEBUG_AGENT_ID || agentId.startsWith('tool::')) {
    return;
  }
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
      ConsistentRead: true,
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

export const getRunById = async (runId: string) => {
  const recent = await listRecentRuns(80);
  return recent.find((run) => run.runId === runId) ?? null;
};

export const listRecentRuns = async (limit = 40) => {
  const agents = await listAgents();
  const collected: AgentRunRecord[] = [];
  for (const agent of agents) {
    collected.push(...(await listRuns(agent.id, 20)));
  }
  collected.push(...(await listRuns(TOOL_DEBUG_AGENT_ID, 20)));
  return collected
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, Math.min(Math.max(limit, 1), 100));
};
