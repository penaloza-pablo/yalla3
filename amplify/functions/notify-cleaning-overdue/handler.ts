import type { EventBridgeHandler } from 'aws-lambda';
import {
  normalizeStartTime,
  queryCleaningVisitsForDate,
} from '../shared/cleaning-plan';
import {
  loadPropertyNickname,
  overdueCleaningBlocks,
  overdueCleaningMessage,
  overdueNotifyKey,
  SLACK_OVERDUE_FIELD,
} from '../shared/slack-cleaning';
import { loadSlackSecrets, slackApi } from '../shared/slack';
import {
  getNowTimeInMadrid,
  getTodayInMadrid,
  patchUserOriginatedRecord,
  TERMINAL_VISIT_STATUSES,
} from '../shared/visit-task-utils';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const handler: EventBridgeHandler<'Scheduled Event', void, void> =
  async () => {
    const visitsTable = process.env.TABLE_NAME;
    const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE || '';
    if (!visitsTable) {
      throw new Error('TABLE_NAME is not configured.');
    }

    const secrets = await loadSlackSecrets({ forceRefresh: true });
    if (!secrets.botToken || !secrets.cleaningOverdueChannelId) {
      console.error(
        'Slack notify skipped: missing botToken or cleaningOverdueChannelId in yalla/slack.',
      );
      return;
    }

    const today = getTodayInMadrid();
    const nowTime = getNowTimeInMadrid();
    const visits = await queryCleaningVisitsForDate(visitsTable, today);

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

      const nickname = await loadPropertyNickname(detailsTable, visit);
      const title = asString(visit.title) || nickname;
      const text = overdueCleaningMessage(title);
      try {
        console.log(
          `Posting overdue cleaning ${visitId} to Slack channel ${secrets.cleaningOverdueChannelId}`,
        );
        await slackApi('chat.postMessage', {
          channel: secrets.cleaningOverdueChannelId,
          text,
          blocks: overdueCleaningBlocks(visitId, title),
        });
        await patchUserOriginatedRecord(visitsTable, visitId, {
          set: { [SLACK_OVERDUE_FIELD]: notifyKey },
        });
      } catch (error) {
        console.error(`Failed to notify overdue cleaning ${visitId}`, error);
      }
    }
  };
