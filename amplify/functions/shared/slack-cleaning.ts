import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { recordCleaningCompletion } from './cleaner-stats';
import { getPlanByDate, isCleaningVisitType, normalizeStartTime } from './cleaning-plan';
import { canReopenCleaningPlanForBookingChange } from './cleaning-plan-booking-change-format';
import {
  listingIdentityKeys,
  visitMatchesListingKeys,
} from './cleaning-plan-booking-context';
import { nowIso } from './dynamo-http';
import { loadSlackSecrets, slackApi } from './slack';
import {
  isP2BuildingId,
  isP2RoomListingId,
  isP2RoomNickname,
  resolveYallaPropertyLabelFromRecord,
} from './property-identity';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import { hasGuestyTaskId, invokeGuestyTaskSync } from './guesty-sync';
import {
  docClient,
  getNowTimeInMadrid,
  getTodayInMadrid,
  patchUserOriginatedRecord,
  reassertVisitSchedule,
  TERMINAL_VISIT_STATUSES,
  visitHasOpenTasks,
} from './visit-task-utils';
import {
  notStartedResolvedInYallaText,
  overdueCompletedInYallaText,
  SLACK_NOT_STARTED_CHANNEL_FIELD,
  SLACK_NOT_STARTED_FIELD,
  SLACK_NOT_STARTED_TS_FIELD,
  SLACK_OVERDUE_CHANNEL_FIELD,
  SLACK_OVERDUE_FIELD,
  SLACK_OVERDUE_TS_FIELD,
} from './slack-overdue';

export {
  isPastOverdueGrace,
  isPastStartGrace,
  notStartedResolvedInYallaText,
  overdueCompletedInYallaText,
  overdueLookbackDates,
  overdueNotifyKey,
  OVERDUE_GRACE_MINUTES,
  SLACK_NOT_STARTED_CHANNEL_FIELD,
  SLACK_NOT_STARTED_FIELD,
  SLACK_NOT_STARTED_TS_FIELD,
  SLACK_OVERDUE_CHANNEL_FIELD,
  SLACK_OVERDUE_FIELD,
  SLACK_OVERDUE_TS_FIELD,
} from './slack-overdue';

export const SNOOZE_ACTION_ID = 'cleaning_snooze';
export const DONE_ACTION_ID = 'cleaning_done';
export const START_SNOOZE_ACTION_ID = 'cleaning_start_snooze';
export const START_DONE_ACTION_ID = 'cleaning_start_done';
export const SNOOZE_MODAL_CALLBACK = 'cleaning_snooze_modal';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const escapeMrkdwn = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const loadVisit = async (visitsTable: string, visitId: string) => {
  const found = await docClient.send(
    new GetCommand({ TableName: visitsTable, Key: { id: visitId } }),
  );
  return (found.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const loadPropertyNickname = async (
  detailsTable: string,
  visit: Record<string, unknown>,
) => {
  const propertyId = asString(visit.propertyId);
  if (detailsTable && propertyId) {
    const found = await docClient.send(
      new GetCommand({ TableName: detailsTable, Key: { id: propertyId } }),
    );
    const fromRecord = resolveYallaPropertyLabelFromRecord(
      found.Item as Record<string, unknown> | undefined,
      propertyId,
    );
    if (fromRecord) {
      return fromRecord;
    }
  }
  return resolveYallaPropertyLabelFromRecord(
    {
      id: propertyId,
      nickname: asString(visit.Property) || asString(visit.property),
      title: asString(visit.title),
    },
    propertyId || asString(visit.id),
  );
};

export const isOpenCleaningVisit = (visit: Record<string, unknown>) => {
  const typeId = asString(visit.visitTypeId);
  const status = asString(visit.status).toUpperCase();
  return (
    isCleaningVisitType(typeId) && !TERMINAL_VISIT_STATUSES.has(status)
  );
};

const DEFAULT_APP_BASE_URL = 'https://main.dd8kh4wy2zlme.amplifyapp.com';

export const cleaningDisplayTitle = (
  visit: Record<string, unknown>,
  fallback: string,
) => {
  const title = asString(visit.title);
  return title || fallback;
};

const appBaseUrl = () =>
  (process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/$/, '');

export const visitAppUrl = (visitId: string) =>
  `${appBaseUrl()}/?visit=${encodeURIComponent(visitId)}`;

export const appPageUrl = (page: string, extra?: Record<string, string>) => {
  const parts = [`page=${encodeURIComponent(page)}`];
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return `${appBaseUrl()}/?${parts.join('&')}`;
};

export const overdueCleaningMessage = (title: string) =>
  `${escapeMrkdwn(title)} debería haber terminado y no se ha cerrado:`;

export const notStartedCleaningMessage = (title: string) =>
  `${escapeMrkdwn(title)} debería haber empezado y no se ha iniciado:`;

export const overdueMaintenanceMessage = (title: string) =>
  `${escapeMrkdwn(title)} (mantenimiento) debería haber terminado y no se ha cerrado.`;

export const overdueMaintenanceBlocks = (visitId: string, title: string) => {
  const url = visitAppUrl(visitId);
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${url}|${escapeMrkdwn(title)}> debería haber terminado y no se ha cerrado.`,
      },
    },
  ];
};

const P2_CLEANING_PROPERTIES = new Set(
  [
    'P2',
    '201',
    '202',
    '203',
    '204',
    '205',
    '206',
    '207',
    '208',
    '209',
    '210',
    '211',
    '212',
  ].map((value) => value.toLowerCase()),
);

const normalizeTeamLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

export const classifyOverdueTeam = (
  teamId: string,
  teamName = '',
): 'cleaning' | 'maintenance' | null => {
  const combined = normalizeTeamLabel(`${teamName} ${teamId}`);
  if (!combined.trim()) {
    return null;
  }
  if (combined.includes('maint') || combined.includes('manten')) {
    return 'maintenance';
  }
  if (combined.includes('clean') || combined.includes('limpiez')) {
    return 'cleaning';
  }
  return null;
};

export const isP2CleaningProperty = (...values: string[]) =>
  values.some((value) => {
    const trimmed = value.trim();
    return (
      P2_CLEANING_PROPERTIES.has(trimmed.toLowerCase()) ||
      isP2RoomListingId(trimmed) ||
      isP2RoomNickname(trimmed) ||
      isP2BuildingId(trimmed)
    );
  });

export type OverdueChannelKey =
  | 'cleaningChannelId'
  | 'P2cleaningChannelId'
  | 'maintenanceChannelId';

export const resolveOverdueChannel = (params: {
  teamKind: 'cleaning' | 'maintenance' | null;
  nickname: string;
  propertyId: string;
  title: string;
  secrets: {
    cleaningChannelId: string;
    p2CleaningChannelId: string;
    maintenanceChannelId: string;
  };
}): { key: OverdueChannelKey; channelId: string } | null => {
  if (params.teamKind === 'maintenance') {
    return params.secrets.maintenanceChannelId
      ? {
          key: 'maintenanceChannelId',
          channelId: params.secrets.maintenanceChannelId,
        }
      : null;
  }
  if (params.teamKind !== 'cleaning') {
    return null;
  }
  if (
    isP2CleaningProperty(params.nickname, params.propertyId, params.title)
  ) {
    return params.secrets.p2CleaningChannelId
      ? {
          key: 'P2cleaningChannelId',
          channelId: params.secrets.p2CleaningChannelId,
        }
      : null;
  }
  return params.secrets.cleaningChannelId
    ? { key: 'cleaningChannelId', channelId: params.secrets.cleaningChannelId }
    : null;
};

export const notStartedCleaningBlocks = (visitId: string, nickname: string) => [
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: notStartedCleaningMessage(nickname),
    },
  },
  {
    type: 'actions',
    block_id: `cleaning_not_started_actions:${visitId}`.slice(0, 255),
    elements: [
      {
        type: 'button',
        action_id: START_SNOOZE_ACTION_ID,
        text: { type: 'plain_text', text: 'Posponer' },
        value: visitId,
      },
      {
        type: 'button',
        action_id: START_DONE_ACTION_ID,
        style: 'primary',
        text: { type: 'plain_text', text: 'Iniciada' },
        value: visitId,
      },
    ],
  },
];

export const overdueCleaningBlocks = (visitId: string, nickname: string) => [
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: overdueCleaningMessage(nickname),
    },
  },
  {
    type: 'actions',
    block_id: `cleaning_overdue_actions:${visitId}`.slice(0, 255),
    elements: [
      {
        type: 'button',
        action_id: SNOOZE_ACTION_ID,
        text: { type: 'plain_text', text: 'Posponer' },
        value: visitId,
      },
      {
        type: 'button',
        action_id: DONE_ACTION_ID,
        style: 'primary',
        text: { type: 'plain_text', text: 'Listo' },
        value: visitId,
      },
    ],
  },
];

export const snoozeModalView = (options: {
  visitId: string;
  channelId: string;
  messageTs: string;
  initialTime: string;
  kind?: 'end' | 'start';
}) => ({
  type: 'modal',
  callback_id: SNOOZE_MODAL_CALLBACK,
  private_metadata: JSON.stringify({
    visitId: options.visitId,
    channelId: options.channelId,
    messageTs: options.messageTs,
    kind: options.kind ?? 'end',
  }),
  title: { type: 'plain_text', text: 'Posponer' },
  submit: { type: 'plain_text', text: 'Guardar' },
  close: { type: 'plain_text', text: 'Cancelar' },
  blocks: [
    {
      type: 'input',
      block_id: 'end_time',
      label: {
        type: 'plain_text',
        text:
          options.kind === 'start'
            ? 'Nueva hora de inicio'
            : 'Nueva hora de finalización',
      },
      element: {
        type: 'timepicker',
        action_id: 'scheduled_end_time',
        initial_time: options.initialTime || getNowTimeInMadrid(),
        placeholder: { type: 'plain_text', text: 'Elige una hora' },
      },
    },
  ],
});

const replaceMessage = async (
  channelId: string,
  messageTs: string,
  text: string,
) => {
  if (!channelId || !messageTs) {
    return;
  }
  await slackApi('chat.update', {
    channel: channelId,
    ts: messageTs,
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  });
};

const messageMentionsVisit = (
  message: Record<string, unknown>,
  visitId: string,
  title: string,
) => {
  const serialized = JSON.stringify(message);
  if (visitId && serialized.includes(visitId)) {
    return true;
  }
  return Boolean(title) && asString(message.text).includes(title);
};

const isOverdueSlackMessage = (message: Record<string, unknown>) => {
  const text = asString(message.text);
  if (text.includes('debería haber terminado')) {
    return true;
  }
  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  return blocks.some((block) => {
    const record = asRecord(block);
    const elements = Array.isArray(record?.elements) ? record.elements : [];
    return elements.some((element) => {
      const actionId = asString(asRecord(element)?.action_id);
      return actionId === DONE_ACTION_ID || actionId === SNOOZE_ACTION_ID;
    });
  });
};

const findOverdueSlackMessage = async (visit: Record<string, unknown>) => {
  const visitId = asString(visit.id);
  const title = asString(visit.title);
  if (!visitId) {
    return null;
  }
  let channelId = asString(visit[SLACK_OVERDUE_CHANNEL_FIELD]);
  if (!channelId) {
    const secrets = await loadSlackSecrets();
    const nickname = await loadPropertyNickname(
      process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
      visit,
    );
    const teamKind = classifyOverdueTeam(
      asString(visit.teamId),
      asString(visit.team),
    );
    const channel = resolveOverdueChannel({
      teamKind,
      nickname,
      propertyId: asString(visit.propertyId),
      title: title || nickname,
      secrets,
    });
    channelId = channel?.channelId ?? '';
  }
  if (!channelId) {
    return null;
  }
  try {
    const history = (await slackApi('conversations.history', {
      channel: channelId,
      limit: 100,
    })) as { messages?: unknown[] };
    const messages = Array.isArray(history.messages) ? history.messages : [];
    for (const raw of messages) {
      const message = asRecord(raw);
      if (!message) {
        continue;
      }
      const ts = asString(message.ts);
      if (
        ts &&
        isOverdueSlackMessage(message) &&
        messageMentionsVisit(message, visitId, title)
      ) {
        return { channelId, messageTs: ts };
      }
    }
  } catch (error) {
    console.error(
      `Failed to search overdue Slack message for visit ${visitId}`,
      error,
    );
  }
  return null;
};

export const markOverdueSlackMessageCompletedInYalla = async (
  visit: Record<string, unknown>,
) => {
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningOverdue,
    ))
  ) {
    return;
  }
  if (!asString(visit[SLACK_OVERDUE_FIELD]) && !asString(visit[SLACK_OVERDUE_TS_FIELD])) {
    return;
  }
  const title = asString(visit.title) || 'Visita';
  let channelId = asString(visit[SLACK_OVERDUE_CHANNEL_FIELD]);
  let messageTs = asString(visit[SLACK_OVERDUE_TS_FIELD]);
  if (!channelId || !messageTs) {
    const found = await findOverdueSlackMessage(visit);
    if (!found) {
      return;
    }
    channelId = found.channelId;
    messageTs = found.messageTs;
  }
  await replaceMessage(
    channelId,
    messageTs,
    overdueCompletedInYallaText(escapeMrkdwn(title)),
  );
};

export const completeCleaningFromSlack = async (options: {
  visitsTable: string;
  tasksTable: string;
  visitId: string;
  closedBy: string;
  channelId: string;
  messageTs: string;
}) => {
  const visit = await loadVisit(options.visitsTable, options.visitId);
  if (!visit) {
    return { ok: false, message: 'No se encontró la visita.' };
  }
  const currentStatus = asString(visit.status).toUpperCase();
  if (TERMINAL_VISIT_STATUSES.has(currentStatus)) {
    const nickname = await loadPropertyNickname(
      process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
      visit,
    );
    const text =
      currentStatus === 'CANCELLED'
        ? `La limpieza de ${escapeMrkdwn(nickname)} ya estaba cancelada.`
        : `La limpieza de ${escapeMrkdwn(nickname)} ya estaba marcada como lista.`;
    await replaceMessage(options.channelId, options.messageTs, text);
    return { ok: true, alreadyClosed: true, message: text };
  }
  if (!isOpenCleaningVisit(visit)) {
    return { ok: false, message: 'La visita ya no está abierta.' };
  }
  const scheduledDate = asString(visit.scheduledDate).slice(0, 10);
  if (scheduledDate && scheduledDate > getTodayInMadrid()) {
    return {
      ok: false,
      message: 'No se puede completar una visita de un día futuro.',
    };
  }
  if (options.tasksTable) {
    const hasOpenTasks = await visitHasOpenTasks(
      options.tasksTable,
      options.visitId,
    );
    if (hasOpenTasks) {
      const nickname = await loadPropertyNickname(
        process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
        visit,
      );
      const title = cleaningDisplayTitle(visit, nickname);
      const url = visitAppUrl(options.visitId);
      return {
        ok: false,
        message: `No se han completado todas las tareas de ${escapeMrkdwn(title)}, imposible cerrar. <${url}|Abrir en yalla>`,
      };
    }
  }
  const timestamp = nowIso();
  const setFields = {
    status: 'COMPLETED',
    closedAt: timestamp,
    closedBy: options.closedBy,
  };
  await patchUserOriginatedRecord(options.visitsTable, options.visitId, {
    set: setFields,
  });
  const completedVisit = {
    ...visit,
    ...setFields,
    id: options.visitId,
  };
  if (hasGuestyTaskId(completedVisit)) {
    try {
      await reassertVisitSchedule(
        options.visitsTable,
        options.visitId,
        completedVisit,
      );
      const syncResult = await invokeGuestyTaskSync({
        tableName: options.visitsTable,
        id: options.visitId,
        invocationType: 'Event',
      });
      if (!syncResult.ok) {
        console.error(
          'Failed to sync Slack completion to Guesty',
          syncResult.error,
        );
      }
    } catch (error) {
      console.error('Failed to sync Slack completion to Guesty', error);
    }
  }
  try {
    await recordCleaningCompletion(completedVisit);
  } catch (error) {
    console.error('Failed to record cleaning completion from Slack', error);
  }
  const nickname = await loadPropertyNickname(
    process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
    visit,
  );
  const text = `La limpieza de ${escapeMrkdwn(nickname)} se marcó como lista.`;
  await replaceMessage(options.channelId, options.messageTs, text);
  return { ok: true, message: text };
};

export const snoozeCleaningFromSlack = async (options: {
  visitsTable: string;
  visitId: string;
  newEndTime: string;
  channelId: string;
  messageTs: string;
}) => {
  const endTime = normalizeStartTime(options.newEndTime);
  if (!endTime) {
    return { ok: false, message: 'Hora no válida.' };
  }
  if (endTime <= getNowTimeInMadrid()) {
    return {
      ok: false,
      message: 'Elige una hora posterior a ahora (hora de Madrid).',
    };
  }
  const visit = await loadVisit(options.visitsTable, options.visitId);
  if (!visit || !isOpenCleaningVisit(visit)) {
    return { ok: false, message: 'La visita ya no está abierta.' };
  }
  await patchUserOriginatedRecord(options.visitsTable, options.visitId, {
    set: { scheduledEndTime: endTime },
    remove: [SLACK_OVERDUE_FIELD],
  });
  const nickname = await loadPropertyNickname(
    process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
    visit,
  );
  const text = `La limpieza de ${escapeMrkdwn(nickname)} se pospuso. Nueva hora de finalización: ${endTime}.`;
  await replaceMessage(options.channelId, options.messageTs, text);
  return { ok: true, message: text };
};

const clockMinutes = (value: string) => {
  const normalized = normalizeStartTime(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
};

const clockFromMinutes = (total: number) => {
  const capped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  const hours = Math.floor(capped / 60);
  const minutes = capped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const isNotStartedSlackMessage = (message: Record<string, unknown>) => {
  const text = asString(message.text);
  if (text.includes('debería haber empezado')) {
    return true;
  }
  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  return blocks.some((block) => {
    const record = asRecord(block);
    const elements = Array.isArray(record?.elements) ? record.elements : [];
    return elements.some((element) => {
      const actionId = asString(asRecord(element)?.action_id);
      return (
        actionId === START_DONE_ACTION_ID || actionId === START_SNOOZE_ACTION_ID
      );
    });
  });
};

const findNotStartedSlackMessage = async (visit: Record<string, unknown>) => {
  const visitId = asString(visit.id);
  const title = asString(visit.title);
  if (!visitId) {
    return null;
  }
  let channelId = asString(visit[SLACK_NOT_STARTED_CHANNEL_FIELD]);
  if (!channelId) {
    const secrets = await loadSlackSecrets();
    const nickname = await loadPropertyNickname(
      process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
      visit,
    );
    const channel = resolveOverdueChannel({
      teamKind: 'cleaning',
      nickname,
      propertyId: asString(visit.propertyId),
      title: title || nickname,
      secrets,
    });
    channelId = channel?.channelId ?? '';
  }
  if (!channelId) {
    return null;
  }
  try {
    const history = (await slackApi('conversations.history', {
      channel: channelId,
      limit: 100,
    })) as { messages?: unknown[] };
    const messages = Array.isArray(history.messages) ? history.messages : [];
    for (const raw of messages) {
      const message = asRecord(raw);
      if (!message) {
        continue;
      }
      const ts = asString(message.ts);
      if (
        ts &&
        isNotStartedSlackMessage(message) &&
        messageMentionsVisit(message, visitId, title)
      ) {
        return { channelId, messageTs: ts };
      }
    }
  } catch (error) {
    console.error(
      `Failed to search not-started Slack message for visit ${visitId}`,
      error,
    );
  }
  return null;
};

export const markNotStartedSlackMessageResolvedInYalla = async (
  visit: Record<string, unknown>,
  resolution: 'started' | 'completed' = 'started',
) => {
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningNotStarted,
    ))
  ) {
    return;
  }
  if (
    !asString(visit[SLACK_NOT_STARTED_FIELD]) &&
    !asString(visit[SLACK_NOT_STARTED_TS_FIELD])
  ) {
    return;
  }
  const title = asString(visit.title) || 'Visita';
  let channelId = asString(visit[SLACK_NOT_STARTED_CHANNEL_FIELD]);
  let messageTs = asString(visit[SLACK_NOT_STARTED_TS_FIELD]);
  if (!channelId || !messageTs) {
    const found = await findNotStartedSlackMessage(visit);
    if (!found) {
      return;
    }
    channelId = found.channelId;
    messageTs = found.messageTs;
  }
  const text =
    resolution === 'completed'
      ? overdueCompletedInYallaText(escapeMrkdwn(title))
      : notStartedResolvedInYallaText(escapeMrkdwn(title));
  await replaceMessage(channelId, messageTs, text);
};

export const startCleaningFromSlack = async (options: {
  visitsTable: string;
  visitId: string;
  channelId: string;
  messageTs: string;
}) => {
  const visit = await loadVisit(options.visitsTable, options.visitId);
  if (!visit) {
    return { ok: false, message: 'No se encontró la visita.' };
  }
  const currentStatus = asString(visit.status).toUpperCase();
  const nickname = await loadPropertyNickname(
    process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
    visit,
  );
  if (TERMINAL_VISIT_STATUSES.has(currentStatus)) {
    const text =
      currentStatus === 'CANCELLED'
        ? `La limpieza de ${escapeMrkdwn(nickname)} ya estaba cancelada.`
        : overdueCompletedInYallaText(escapeMrkdwn(nickname));
    await replaceMessage(options.channelId, options.messageTs, text);
    return { ok: true, alreadyClosed: true, message: text };
  }
  if (asString(visit.startedAt)) {
    const text = notStartedResolvedInYallaText(escapeMrkdwn(nickname));
    await replaceMessage(options.channelId, options.messageTs, text);
    return { ok: true, alreadyClosed: true, message: text };
  }
  if (!isOpenCleaningVisit(visit)) {
    return { ok: false, message: 'La visita ya no está abierta.' };
  }
  const scheduledDate = asString(visit.scheduledDate).slice(0, 10);
  if (scheduledDate && scheduledDate > getTodayInMadrid()) {
    return {
      ok: false,
      message: 'No se puede iniciar una visita de un día futuro.',
    };
  }
  const timestamp = nowIso();
  await patchUserOriginatedRecord(options.visitsTable, options.visitId, {
    set: { startedAt: timestamp },
  });
  const text = `La limpieza de ${escapeMrkdwn(nickname)} se marcó como iniciada.`;
  await replaceMessage(options.channelId, options.messageTs, text);
  return { ok: true, message: text };
};

export const snoozeCleaningStartFromSlack = async (options: {
  visitsTable: string;
  visitId: string;
  newStartTime: string;
  channelId: string;
  messageTs: string;
}) => {
  const startTime = normalizeStartTime(options.newStartTime);
  if (!startTime) {
    return { ok: false, message: 'Hora no válida.' };
  }
  if (startTime <= getNowTimeInMadrid()) {
    return {
      ok: false,
      message: 'Elige una hora posterior a ahora (hora de Madrid).',
    };
  }
  const visit = await loadVisit(options.visitsTable, options.visitId);
  if (!visit || !isOpenCleaningVisit(visit) || asString(visit.startedAt)) {
    return { ok: false, message: 'La visita ya no está pendiente de inicio.' };
  }
  const previousStart = clockMinutes(asString(visit.scheduledStartTime));
  const previousEnd = clockMinutes(asString(visit.scheduledEndTime));
  const nextStart = clockMinutes(startTime);
  const setFields: Record<string, string> = { scheduledStartTime: startTime };
  if (
    previousStart !== null &&
    previousEnd !== null &&
    nextStart !== null &&
    previousEnd > previousStart
  ) {
    setFields.scheduledEndTime = clockFromMinutes(
      nextStart + (previousEnd - previousStart),
    );
  }
  await patchUserOriginatedRecord(options.visitsTable, options.visitId, {
    set: setFields,
    remove: [SLACK_NOT_STARTED_FIELD],
  });
  const nickname = await loadPropertyNickname(
    process.env.PROPERTY_CLEANING_DETAILS_TABLE || '',
    visit,
  );
  const text = `La limpieza de ${escapeMrkdwn(nickname)} se pospuso. Nueva hora de inicio: ${startTime}.`;
  await replaceMessage(options.channelId, options.messageTs, text);
  return { ok: true, message: text };
};

export const notifyVisitClosedWithComments = async (visit: {
  id?: unknown;
  title?: unknown;
  comments?: unknown;
}) => {
  const visitId = asString(visit.id);
  const title = asString(visit.title) || visitId || 'Visit';
  const comments = asString(visit.comments);
  if (!visitId || comments.length < 4) {
    return;
  }
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.visitClosedComments,
    ))
  ) {
    console.log('Slack comments notify skipped: automation disabled.');
    return;
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Slack comments notify skipped: missing warningsChannelId in yalla/slack.',
    );
    return;
  }
  const url = visitAppUrl(visitId);
  const text = `<${url}|${escapeMrkdwn(title)}> se ha cerrado con los siguientes comentarios: ${escapeMrkdwn(comments)}.`;
  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text,
  });
};

export const notifyCleaningPlanReopened = async (plannedDate: string) => {
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningPlanReopened,
    ))
  ) {
    console.log('Cleaning plan reopen notify skipped: automation disabled.');
    return;
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Cleaning plan reopen notify skipped: missing warningsChannelId in yalla/slack.',
    );
    return;
  }
  const date = asString(plannedDate);
  const text = `Se reabrió el plan de limpieza del ${escapeMrkdwn(date)}. Estaba marcado como listo.`;
  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text,
  });
};

export type CleaningPlanChangeItem = {
  visitId: string;
  title: string;
  cleanerName: string;
  startTime: string;
  cleaningTypeName: string;
  qualityReview: boolean;
};

const labelOrEmpty = (value: string, empty: string) =>
  asString(value) || empty;

export const describeCleaningPlanChanges = (
  previous: CleaningPlanChangeItem[],
  next: CleaningPlanChangeItem[],
) => {
  const changes: string[] = [];
  const previousById = new Map(previous.map((item) => [item.visitId, item]));
  const nextById = new Map(next.map((item) => [item.visitId, item]));
  for (const item of next) {
    const before = previousById.get(item.visitId);
    const title = labelOrEmpty(item.title, item.visitId);
    if (!before) {
      changes.push(`Añadida: ${title}`);
      continue;
    }
    if (before.startTime !== item.startTime) {
      changes.push(
        `${title}: hora ${labelOrEmpty(before.startTime, 'sin hora')} → ${labelOrEmpty(item.startTime, 'sin hora')}`,
      );
    }
    if (before.cleanerName !== item.cleanerName) {
      changes.push(
        `${title}: cleaner ${labelOrEmpty(before.cleanerName, 'sin asignar')} → ${labelOrEmpty(item.cleanerName, 'sin asignar')}`,
      );
    }
    if (before.cleaningTypeName !== item.cleaningTypeName) {
      changes.push(
        `${title}: tipo ${labelOrEmpty(before.cleaningTypeName, 'sin tipo')} → ${labelOrEmpty(item.cleaningTypeName, 'sin tipo')}`,
      );
    }
    if (before.qualityReview !== item.qualityReview) {
      changes.push(
        `${title}: Quality Check ${item.qualityReview ? 'activado' : 'desactivado'}`,
      );
    }
  }
  for (const item of previous) {
    if (!nextById.has(item.visitId)) {
      changes.push(`Eliminada: ${labelOrEmpty(item.title, item.visitId)}`);
    }
  }
  return changes;
};

export const notifyCleaningPlanChanges = async (
  plannedDate: string,
  changes: string[],
) => {
  if (changes.length === 0) {
    return;
  }
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningPlanChanges,
    ))
  ) {
    console.log('Cleaning plan changes notify skipped: automation disabled.');
    return;
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Cleaning plan changes notify skipped: missing warningsChannelId in yalla/slack.',
    );
    return;
  }
  const date = asString(plannedDate);
  const lines = changes
    .map((line) => `• ${escapeMrkdwn(line)}`)
    .join('\n');
  const text = `Cambios en el plan de limpieza del ${escapeMrkdwn(date)}:\n${lines}`;
  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text,
  });
};

export const notifyReadyCleaningPlanBookingChanges = async ({
  checkInDates,
  listingLabel,
  listingId,
  listingNickname,
  confirmationCode,
  guestName,
  changes,
}: {
  checkInDates: string[];
  listingLabel: string;
  listingId?: string;
  listingNickname?: string;
  confirmationCode?: string;
  guestName?: string;
  changes: string[];
}) => {
  if (changes.length === 0) {
    return;
  }
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningPlanBooking,
    ))
  ) {
    console.log(
      'Cleaning plan booking notify skipped: automation disabled.',
    );
    return;
  }
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  if (!plansTable) {
    console.warn(
      'Cleaning plan booking notify skipped: CLEANING_PLANS_TABLE is not configured.',
    );
    return;
  }
  const uniqueDates = [
    ...new Set(checkInDates.map((value) => asString(value)).filter(Boolean)),
  ];
  const today = getTodayInMadrid();
  const nowTime = getNowTimeInMadrid();
  const listingKeys = listingIdentityKeys(
    listingId,
    listingNickname,
    listingLabel,
  );
  const readyDates: string[] = [];
  for (const date of uniqueDates) {
    if (!canReopenCleaningPlanForBookingChange({ plannedDate: date, today, nowTime })) {
      continue;
    }
    const plan = await getPlanByDate(plansTable, date);
    const status =
      typeof plan?.status === 'string' ? plan.status.toUpperCase() : '';
    if (status !== 'READY') {
      continue;
    }
    const planItems = Array.isArray(plan?.items) ? plan.items : [];
    const onPlan = planItems.some((item) =>
      visitMatchesListingKeys(
        item && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : {},
        listingKeys,
      ),
    );
    if (!onPlan) {
      continue;
    }
    readyDates.push(date);
  }
  if (readyDates.length === 0) {
    return;
  }
  const { cleaningChannelId } = await loadSlackSecrets();
  if (!cleaningChannelId) {
    console.error(
      'Cleaning plan booking notify skipped: missing cleaningChannelId in yalla/slack.',
    );
    return;
  }
  const who = [listingLabel, guestName, confirmationCode]
    .map((value) => asString(value))
    .filter(Boolean)
    .join(' · ');
  const lines = changes
    .map((line) => `• ${escapeMrkdwn(line)}`)
    .join('\n');
  const header = `Cambios en reserva (plan de limpieza listo · ${escapeMrkdwn(readyDates.join(', '))})`;
  const text = who
    ? `${header} · ${escapeMrkdwn(who)}:\n${lines}`
    : `${header}:\n${lines}`;
  await slackApi('chat.postMessage', {
    channel: cleaningChannelId,
    text,
  });
};
