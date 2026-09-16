export const TODAY_VIEW_MODES = [
  'dashboard',
  'board',
  'day',
  'agenda2',
  'kanban',
  'agenda',
  'myJobs',
] as const;

export type TodayViewMode = (typeof TODAY_VIEW_MODES)[number];

export const DEFAULT_TODAY_VIEWS: TodayViewMode[] = [...TODAY_VIEW_MODES];

export const isTodayViewMode = (value: unknown): value is TodayViewMode =>
  typeof value === 'string' &&
  (TODAY_VIEW_MODES as readonly string[]).includes(value);

export const parseTodayViews = (value: unknown): TodayViewMode[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const allowed = new Set(value.filter(isTodayViewMode));
  return TODAY_VIEW_MODES.filter((view) => allowed.has(view));
};

export const resolveTodayViews = (value: unknown): TodayViewMode[] => {
  const parsed = parseTodayViews(value);
  if (!parsed || parsed.length === 0) {
    return [...DEFAULT_TODAY_VIEWS];
  }
  return parsed;
};
