import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { recordCleaningCompletion } from './cleaner-stats';
import { CLEANING_VISIT_TYPE_ID, normalizeStartTime } from './cleaning-plan';
import { nowIso } from './dynamo-http';
import { loadSlackSecrets, slackApi } from './slack';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import {
  docClient,
  getNowTimeInMadrid,
  patchUserOriginatedRecord,
  TERMINAL_VISIT_STATUSES,
  visitHasOpenTasks,
} from './visit-task-utils';

export const SLACK_OVERDUE_FIELD = 'slackOverdueNotifiedFor';
export const SNOOZE_ACTION_ID = 'cleaning_snooze';
export const DONE_ACTION_ID = 'cleaning_done';
export const SNOOZE_MODAL_CALLBACK = 'cleaning_snooze_modal';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const overdueNotifyKey = (scheduledDate: string, endTime: string) =>
  `${scheduledDate}|${endTime}`;

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
    const nickname = asString(found.Item?.nickname);
    if (nickname) {
      return nickname;
    }
  }
  return (
    asString(visit.Property) ||
    asString(visit.property) ||
    asString(visit.title) ||
    propertyId ||
    asString(visit.id)
  );
};

export const isOpenCleaningVisit = (visit: Record<string, unknown>) => {
  const typeId = asString(visit.visitTypeId);
  const status = asString(visit.status).toUpperCase();
  return (
    typeId === CLEANING_VISIT_TYPE_ID && !TERMINAL_VISIT_STATUSES.has(status)
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

export const visitAppUrl = (visitId: string) => {
  const base = (process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(
    /\/$/,
    '',
  );
  return `${base}/?visit=${encodeURIComponent(visitId)}`;
};

export const overdueCleaningMessage = (title: string) =>
  `${escapeMrkdwn(title)} debería haber terminado y no se ha cerrado:`;

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
  values.some((value) => P2_CLEANING_PROPERTIES.has(value.trim().toLowerCase()));

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
    block_id: 'cleaning_overdue_actions',
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
}) => ({
  type: 'modal',
  callback_id: SNOOZE_MODAL_CALLBACK,
  private_metadata: JSON.stringify({
    visitId: options.visitId,
    channelId: options.channelId,
    messageTs: options.messageTs,
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
        text: 'Nueva hora de finalización',
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

export const completeCleaningFromSlack = async (options: {
  visitsTable: string;
  tasksTable: string;
  visitId: string;
  closedBy: string;
  channelId: string;
  messageTs: string;
}) => {
  const visit = await loadVisit(options.visitsTable, options.visitId);
  if (!visit || !isOpenCleaningVisit(visit)) {
    return { ok: false, message: 'La visita ya no está abierta.' };
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
  try {
    await recordCleaningCompletion({
      ...visit,
      ...setFields,
      id: options.visitId,
    });
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
