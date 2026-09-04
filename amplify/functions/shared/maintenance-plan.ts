import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  getPlanByDate,
  normalizeStartTime,
  scanAllItems,
} from './cleaning-plan';
import { docClient } from './visit-task-utils';

export { getPlanByDate, scanAllItems, normalizeStartTime };

export const isMaintenanceTeamName = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return normalized.includes('maint') || normalized.includes('manten');
};

export const resolveMaintenanceTeamId = async (teamsTable: string) => {
  const configured = process.env.MAINTENANCE_TEAM_ID?.trim();
  if (configured) {
    return configured;
  }
  const teams = await scanAllItems(teamsTable);
  const match = teams.find((team) =>
    isMaintenanceTeamName(typeof team.name === 'string' ? team.name : ''),
  );
  return typeof match?.id === 'string' ? match.id : '';
};

const timeToMinutes = (value: string) => {
  const normalized = normalizeStartTime(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesBetweenTimes = (startTime: string, endTime: string) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) {
    return undefined;
  }
  let diff = end - start;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  return diff;
};

export const queryVisitsForScheduledDate = async (
  visitsTable: string,
  scheduledDate: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: visitsTable,
        IndexName: 'scheduledDate-scheduledStartTime-index',
        KeyConditionExpression: '#scheduledDate = :scheduledDate',
        ExpressionAttributeNames: { '#scheduledDate': 'scheduledDate' },
        ExpressionAttributeValues: { ':scheduledDate': scheduledDate },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return items.filter((visit) => {
    const status =
      typeof visit.status === 'string' ? visit.status.toUpperCase() : '';
    return status !== 'CANCELLED';
  });
};

export const queryMaintenanceTeamVisitsForDate = async (
  visitsTable: string,
  scheduledDate: string,
  teamId: string,
) => {
  if (!teamId) {
    return [];
  }
  const visits = await queryVisitsForScheduledDate(visitsTable, scheduledDate);
  return visits.filter((visit) => {
    const visitTeamId = typeof visit.teamId === 'string' ? visit.teamId : '';
    return visitTeamId === teamId;
  });
};

export const loadAgent = async (tableName: string | undefined, agentId: string) => {
  if (!tableName || !agentId) {
    return undefined;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: agentId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};
