import { timeToMinutes } from './plan-resource-overlap';

export const CLEANING_PLAN_EDIT_CUTOFF = '10:30';
export const CLEANING_PLAN_RESTRICTED_START_MIN = '11:00';
export const CLEANING_PLAN_RESTRICTED_START_MAX = '16:00';
export const CLEANING_PLAN_EDIT_LOCKED = 'CLEANING_PLAN_EDIT_LOCKED';
export const CLEANING_PLAN_START_WINDOW = 'CLEANING_PLAN_START_WINDOW';

const cutoffMinutes = timeToMinutes(CLEANING_PLAN_EDIT_CUTOFF) ?? 10 * 60 + 30;
const minStartMinutes =
  timeToMinutes(CLEANING_PLAN_RESTRICTED_START_MIN) ?? 11 * 60;
const maxStartMinutes =
  timeToMinutes(CLEANING_PLAN_RESTRICTED_START_MAX) ?? 16 * 60;

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** True once 10:30 Europe/Madrid of the plan day has been reached, including later days. */
export const isPastCleaningPlanEditCutoff = (
  plannedDate: string,
  today: string,
  nowTime: string,
) => {
  if (!isDateOnly(plannedDate) || !isDateOnly(today)) {
    return false;
  }
  if (plannedDate > today) {
    return false;
  }
  if (plannedDate < today) {
    return true;
  }
  const nowMinutes = timeToMinutes(nowTime);
  return nowMinutes !== null && nowMinutes >= cutoffMinutes;
};

/** Empty times are allowed on drafts. Any other time must fall between 11:00 and 16:00. */
export const isStartTimeWithinRestrictedWindow = (startTime: string) => {
  if (!startTime.trim()) {
    return true;
  }
  const minutes = timeToMinutes(startTime);
  return (
    minutes !== null && minutes >= minStartMinutes && minutes <= maxStartMinutes
  );
};
