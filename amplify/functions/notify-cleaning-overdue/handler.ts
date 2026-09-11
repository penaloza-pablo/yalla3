import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  normalizeStartTime,
  queryVisitsForScheduledDate,
} from '../shared/cleaning-plan';
import {
  classifyOverdueTeam,
  loadPropertyNickname,
  overdueCleaningBlocks,
  overdueCleaningMessage,
  overdueMaintenanceBlocks,
  overdueMaintenanceMessage,
  overdueNotifyKey,
  resolveOverdueChannel,
  SLACK_OVERDUE_FIELD,
} from '../shared/slack-cleaning';
import { loadSlackSecrets, slackApi } from '../shared/slack';
import { notifyEarlyCheckInReady } from '../shared/slack-early-check-in';
import { notifyScheduledOpsDigests } from '../shared/slack-ops-digest';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from '../shared/slack-notifications';
import {
  docClient,
  getNowTimeInMadrid,
  getTodayInMadrid,
  patchUserOriginatedRecord,
  TERMINAL_VISIT_STATUSES,
} from '../shared/visit-task-utils';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const loadTeamNames = async () => {
  const teamsTable = process.env.TEAMS_TABLE;
  const names = new Map<string, string>();
  if (!teamsTable) {
    return names;
  }
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: teamsTable,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = asString(item.id);
      const name = asString(item.name);
      if (id && name) {
        names.set(id, name);
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);
  return names;
};

const isTestChannelsEvent = (event: unknown) =>
  Boolean(
    event &&
      typeof event === 'object' &&
      (event as { action?: string }).action === 'testChannels',
  );

const postTestMessages = async () => {
  const secrets = await loadSlackSecrets({ forceRefresh: true });
  const stamp = new Date().toISOString();
  const channels: Array<{ key: string; channelId: string }> = [
    { key: 'cleaningChannelId', channelId: secrets.cleaningChannelId },
    { key: 'P2cleaningChannelId', channelId: secrets.p2CleaningChannelId },
    { key: 'maintenanceChannelId', channelId: secrets.maintenanceChannelId },
    { key: 'inventoryChannelId', channelId: secrets.inventoryChannelId },
    { key: 'warningsChannelId', channelId: secrets.warningsChannelId },
  ];
  const results: Array<{ key: string; ok: boolean; error?: string }> = [];
  for (const channel of channels) {
    if (!channel.channelId) {
      results.push({
        key: channel.key,
        ok: false,
        error: `Missing ${channel.key} in yalla/slack.`,
      });
      continue;
    }
    const text = `[Yalla prueba] ${channel.key} · ${stamp} · NotifyCleaningOverdue puede escribir en este canal.`;
    try {
      await slackApi('chat.postMessage', { channel: channel.channelId, text });
      results.push({ key: channel.key, ok: true });
    } catch (error) {
      results.push({
        key: channel.key,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.log('Slack overdue channel tests', results);
  return { action: 'testChannels', results };
};

const isEarlyCheckInEvent = (event: unknown) =>
  Boolean(
    event &&
      typeof event === 'object' &&
      (event as { action?: string }).action === 'earlyCheckIn',
  );

const isOpsDigestEvent = (event: unknown) =>
  Boolean(
    event &&
      typeof event === 'object' &&
      (event as { action?: string }).action === 'opsDigest',
  );

export const handler = async (event?: unknown) => {
  if (isTestChannelsEvent(event)) {
    return postTestMessages();
  }

  const visitsTable = process.env.TABLE_NAME;
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE || '';
  if (!visitsTable) {
    throw new Error('TABLE_NAME is not configured.');
  }

  const earlyCheckInForce = isEarlyCheckInEvent(event);
  let early;
  try {
    early = await notifyEarlyCheckInReady({
      ignoreElevenAm: earlyCheckInForce,
    });
  } catch (error) {
    console.error('Failed to notify early check-in ready', error);
  }

  if (earlyCheckInForce) {
    return { early };
  }

  const opsDigestForce = isOpsDigestEvent(event);
  let digest;
  try {
    digest = await notifyScheduledOpsDigests({ force: opsDigestForce });
  } catch (error) {
    console.error('Failed to send scheduled ops Slack digests', error);
  }

  if (opsDigestForce) {
    return { early, digest };
  }

  if (
    !(await isSlackNotificationEnabled(SLACK_NOTIFICATION_IDS.cleaningOverdue))
  ) {
    console.log('Slack overdue notify skipped: automation disabled.');
    return { early, digest };
  }

  const secrets = await loadSlackSecrets({ forceRefresh: true });
  if (!secrets.botToken) {
    console.error('Slack notify skipped: missing botToken in yalla/slack.');
    return { early, digest };
  }

  const today = getTodayInMadrid();
  const nowTime = getNowTimeInMadrid();
  const teamNames = await loadTeamNames();
  const visits = await queryVisitsForScheduledDate(visitsTable, today);

  for (const visit of visits) {
    const visitId = asString(visit.id);
    const status = asString(visit.status).toUpperCase();
    const endTime = normalizeStartTime(asString(visit.scheduledEndTime));
    if (!visitId || !endTime || TERMINAL_VISIT_STATUSES.has(status)) {
      continue;
    }
    if (endTime > nowTime) {
      continue;
    }
    const notifyKey = overdueNotifyKey(today, endTime);
    if (asString(visit[SLACK_OVERDUE_FIELD]) === notifyKey) {
      continue;
    }

    const teamId = asString(visit.teamId);
    const teamKind = classifyOverdueTeam(
      teamId,
      teamNames.get(teamId) ?? asString(visit.team),
    );
    if (!teamKind) {
      continue;
    }

    const nickname = await loadPropertyNickname(detailsTable, visit);
    const title = asString(visit.title) || nickname;
    const channel = resolveOverdueChannel({
      teamKind,
      nickname,
      propertyId: asString(visit.propertyId),
      title,
      secrets,
    });
    if (!channel) {
      console.error(
        `Slack notify skipped for ${visitId}: missing channel for team ${teamKind}.`,
      );
      continue;
    }

    const isMaintenance = teamKind === 'maintenance';
    const text = isMaintenance
      ? overdueMaintenanceMessage(title)
      : overdueCleaningMessage(title);
    const blocks = isMaintenance
      ? overdueMaintenanceBlocks(visitId, title)
      : overdueCleaningBlocks(visitId, title);
    try {
      console.log(
        `Posting overdue ${visitId} to Slack secret key ${channel.key}`,
      );
      await slackApi('chat.postMessage', {
        channel: channel.channelId,
        text,
        blocks,
      });
      await patchUserOriginatedRecord(visitsTable, visitId, {
        set: { [SLACK_OVERDUE_FIELD]: notifyKey },
      });
    } catch (error) {
      console.error(`Failed to notify overdue visit ${visitId}`, error);
    }
  }

  return { early, digest };
};
