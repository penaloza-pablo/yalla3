import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { recordCleaningCompletion } from './cleaner-stats';
import { CLEANING_VISIT_TYPE_ID, normalizeStartTime } from './cleaning-plan';
import { nowIso } from './dynamo-http';
import { slackApi } from './slack';
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

export const overdueCleaningMessage = (nickname: string) =>
  `La limpieza de ${escapeMrkdwn(nickname)} debería haber terminado y no se ha cerrado:`;

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
        text: { type: 'plain_text', text: 'Snooze' },
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
  title: { type: 'plain_text', text: 'Snooze' },
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
      return {
        ok: false,
        message:
          'Hay tareas abiertas. Ciérralas en Yalla antes de marcar la limpieza como lista.',
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
