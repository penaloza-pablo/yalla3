import { normalizeStartTime } from './cleaning-plan';
import { loadSlackSecrets, slackApi } from './slack';
import { appPageUrl, escapeMrkdwn, visitAppUrl } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';

export const AFTERNOON_VISIT_CUTOFF = '13:01';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const isStartTimeAfterAfternoonCutoff = (startTime: string) => {
  const normalized = normalizeStartTime(startTime);
  return Boolean(normalized && normalized > AFTERNOON_VISIT_CUTOFF);
};

export const visitSlackLabel = (
  visit: Record<string, unknown> | undefined,
  fallback = '',
) => {
  if (!visit) {
    return fallback;
  }
  return (
    asString(visit.title) ||
    asString(visit.Property) ||
    asString(visit.property) ||
    fallback
  );
};

export type LatePlanVisit = {
  visitId: string;
  title: string;
  startTime: string;
  assigneeName?: string;
};

export const notifyPlanReadyWithLateVisits = async (options: {
  kind: 'cleaning' | 'maintenance';
  plannedDate: string;
  visits: LatePlanVisit[];
}) => {
  const lateVisits = options.visits.filter((visit) =>
    isStartTimeAfterAfternoonCutoff(visit.startTime),
  );
  if (lateVisits.length === 0) {
    return { sent: false, skipped: 'none' as const };
  }
  if (
    !(await isSlackNotificationEnabled(SLACK_NOTIFICATION_IDS.planReadyLateVisit))
  ) {
    console.log('Late afternoon visit notify skipped: automation disabled.');
    return { sent: false, skipped: 'disabled' as const };
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Late afternoon visit notify skipped: missing warningsChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const isCleaning = options.kind === 'cleaning';
  const planPage = isCleaning ? 'Cleaning Plan' : 'Maintenance Plan';
  const planLabel = isCleaning ? 'limpieza' : 'mantenimiento';
  const planUrl = appPageUrl(planPage, { planDate: options.plannedDate });
  const lines = lateVisits.map((visit) => {
    const title = escapeMrkdwn(visit.title || visit.visitId);
    const url = visitAppUrl(visit.visitId);
    const time = escapeMrkdwn(visit.startTime || 'sin hora');
    const assignee = visit.assigneeName?.trim()
      ? ` · ${escapeMrkdwn(visit.assigneeName.trim())}`
      : '';
    return `• <${url}|${title}> · ${time}${assignee}`;
  });
  const text = [
    `El <${planUrl}|plan de ${planLabel} del ${escapeMrkdwn(options.plannedDate)}> se marcó listo con visitas programadas después de las ${AFTERNOON_VISIT_CUTOFF}:`,
    ...lines,
  ].join('\n');

  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text,
  });
  return { sent: true, skipped: undefined };
};
