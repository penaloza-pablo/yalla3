import { addDaysToDateString, calendarDaysBetween } from './date-range';

export const SLACK_OVERDUE_FIELD = 'slackOverdueNotifiedFor';
export const SLACK_OVERDUE_CHANNEL_FIELD = 'slackOverdueChannelId';
export const SLACK_OVERDUE_TS_FIELD = 'slackOverdueMessageTs';
export const OVERDUE_GRACE_MINUTES = 15;

export const overdueNotifyKey = (scheduledDate: string, endTime: string) =>
  `${scheduledDate}|${endTime}`;

const timeToMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

const minutesToClock = (total: number) => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const SNOOZE_INTERVAL_MINUTES = 15;
export const SNOOZE_MAX_MINUTES = 60;

export const addClockMinutes = (time: string, minutes: number) => {
  const start = timeToMinutes(time);
  if (start === null) {
    return '';
  }
  const next = start + minutes;
  if (next < 0 || next > 23 * 60 + 59) {
    return '';
  }
  return minutesToClock(next);
};

export const snoozeTimeOptions = (anchorTime: string) => {
  const start = timeToMinutes(anchorTime);
  if (start === null) {
    return [] as string[];
  }
  const times: string[] = [];
  for (
    let offset = 0;
    offset <= SNOOZE_MAX_MINUTES;
    offset += SNOOZE_INTERVAL_MINUTES
  ) {
    const total = start + offset;
    if (total > 23 * 60 + 59) {
      break;
    }
    times.push(minutesToClock(total));
  }
  return times;
};

export const isAllowedSnoozeTime = (anchorTime: string, selectedTime: string) =>
  snoozeTimeOptions(anchorTime).includes(selectedTime);

export const SLACK_SNOOZE_START_ORIGIN_FIELD = 'slackSnoozeStartOrigin';
export const SLACK_SNOOZE_END_ORIGIN_FIELD = 'slackSnoozeEndOrigin';

export const clockMinutesDiff = (from: string, to: string) => {
  const start = timeToMinutes(from);
  const end = timeToMinutes(to);
  if (start === null || end === null || end < start) {
    return 0;
  }
  return end - start;
};

export const formatSnoozeDuration = (minutes: number) => {
  const total = Math.max(0, Math.round(minutes));
  if (total <= 0) {
    return '';
  }
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (hours === 1) {
    parts.push('1 hora');
  } else if (hours > 1) {
    parts.push(`${hours} horas`);
  }
  if (mins === 1) {
    parts.push('1 minuto');
  } else if (mins > 0) {
    parts.push(`${mins} minutos`);
  }
  return parts.join(' ');
};

export const isPastOverdueGrace = (options: {
  scheduledDate: string;
  endTime: string;
  today: string;
  nowTime: string;
  graceMinutes?: number;
}) => {
  const endMinutes = timeToMinutes(options.endTime);
  const nowMinutes = timeToMinutes(options.nowTime);
  if (endMinutes === null || nowMinutes === null) {
    return false;
  }
  const elapsedMinutes =
    calendarDaysBetween(options.scheduledDate, options.today) * 1440 +
    nowMinutes;
  return (
    elapsedMinutes >=
    endMinutes + (options.graceMinutes ?? OVERDUE_GRACE_MINUTES)
  );
};

export const overdueLookbackDates = (today: string) => {
  const yesterday = addDaysToDateString(today, -1);
  return yesterday === today ? [today] : [today, yesterday];
};

export const overdueCompletedInYallaText = (title: string) =>
  `${title}: esta visita fue completada en Yalla.`;

export const SLACK_NOT_STARTED_FIELD = 'slackNotStartedNotifiedFor';
export const SLACK_NOT_STARTED_CHANNEL_FIELD = 'slackNotStartedChannelId';
export const SLACK_NOT_STARTED_TS_FIELD = 'slackNotStartedMessageTs';

export const isPastStartGrace = (options: {
  scheduledDate: string;
  startTime: string;
  today: string;
  nowTime: string;
  graceMinutes?: number;
}) =>
  isPastOverdueGrace({
    scheduledDate: options.scheduledDate,
    endTime: options.startTime,
    today: options.today,
    nowTime: options.nowTime,
    graceMinutes: options.graceMinutes,
  });

export const notStartedResolvedInYallaText = (title: string) =>
  `${title}: esta visita fue iniciada en Yalla.`;
