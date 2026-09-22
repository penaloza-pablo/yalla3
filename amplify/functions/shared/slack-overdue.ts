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
