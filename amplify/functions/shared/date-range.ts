export const MAX_VISIT_DATE_RANGE_DAYS = 31;

const parseDateOnly = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const formatDateOnly = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getInclusiveDayCount = (from: string, to: string) => {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) {
    return 0;
  }
  const rangeStart = start.getTime() <= end.getTime() ? start : end;
  const rangeEnd = start.getTime() <= end.getTime() ? end : start;
  const diffMs = rangeEnd.getTime() - rangeStart.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
};

export const listDatesInRange = (from: string, to: string) => {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) {
    return [];
  }
  const rangeStart = start.getTime() <= end.getTime() ? start : end;
  const rangeEnd = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];
  const cursor = new Date(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    dates.push(formatDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};
