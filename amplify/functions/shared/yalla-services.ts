export const YALLA_SERVICE_MODES = ['monitored', 'proposed'] as const;
export type YallaServiceMode = (typeof YALLA_SERVICE_MODES)[number];

export const YALLA_SERVICE_STATUSES = [
  'ok',
  'error',
  'unknown',
  'proposed',
] as const;
export type YallaServiceStatus = (typeof YALLA_SERVICE_STATUSES)[number];

export const YALLA_SERVICE_IDS = {
  guestyBookingsReceiver: 'guesty-bookings-receiver',
  guestyOpenApi: 'guesty-openapi',
  guestyTasksReceiver: 'guesty-tasks-receiver',
  yallaSyncTaskToGuesty: 'yalla-sync-task-to-guesty',
  slackBot: 'slack-bot',
  checkInAccessCron: 'check-in-access-cron',
  akilesLockEvents: 'akiles-lock-events',
  dynamodbOpsTables: 'dynamodb-ops-tables',
} as const;

export type YallaServiceId =
  (typeof YALLA_SERVICE_IDS)[keyof typeof YALLA_SERVICE_IDS];

export type YallaServiceDefinition = {
  id: YallaServiceId;
  mode: YallaServiceMode;
  slackLabel: string;
};

export const YALLA_SERVICES: YallaServiceDefinition[] = [
  {
    id: YALLA_SERVICE_IDS.guestyBookingsReceiver,
    mode: 'monitored',
    slackLabel: 'Guesty → Yalla (reservas)',
  },
  {
    id: YALLA_SERVICE_IDS.guestyOpenApi,
    mode: 'monitored',
    slackLabel: 'Conexión Guesty Open API',
  },
  {
    id: YALLA_SERVICE_IDS.guestyTasksReceiver,
    mode: 'monitored',
    slackLabel: 'Guesty → Yalla (tareas)',
  },
  {
    id: YALLA_SERVICE_IDS.yallaSyncTaskToGuesty,
    mode: 'monitored',
    slackLabel: 'Yalla → Guesty (tareas)',
  },
  {
    id: YALLA_SERVICE_IDS.slackBot,
    mode: 'monitored',
    slackLabel: 'Bot de Slack',
  },
  {
    id: YALLA_SERVICE_IDS.checkInAccessCron,
    mode: 'monitored',
    slackLabel: 'Cron de acceso y avisos de visita',
  },
  {
    id: YALLA_SERVICE_IDS.akilesLockEvents,
    mode: 'monitored',
    slackLabel: 'Cerraduras Akiles',
  },
  {
    id: YALLA_SERVICE_IDS.dynamodbOpsTables,
    mode: 'monitored',
    slackLabel: 'Tablas operativas DynamoDB',
  },
];

export const yallaServiceById = (id: string) =>
  YALLA_SERVICES.find((service) => service.id === id);

export const monitoredYallaServices = () =>
  YALLA_SERVICES.filter((service) => service.mode === 'monitored');

export const isYallaServiceId = (value: string): value is YallaServiceId =>
  YALLA_SERVICES.some((service) => service.id === value);

export type YallaServiceRun = {
  at: string;
  slot: string;
  status: 'ok' | 'error';
  error?: string;
};

export type YallaServiceHealth = {
  serviceId: YallaServiceId;
  status: YallaServiceStatus;
  checkedAt?: string;
  lastOkAt?: string;
  error?: string;
  detail?: string;
  slot?: string;
  consecutiveFailures: number;
  lastNotifiedAt?: string;
  lastRuns: YallaServiceRun[];
};

const MAX_RUNS = 21;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const asRun = (value: unknown): YallaServiceRun | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const at = asString(record.at);
  const slot = asString(record.slot);
  const status = record.status === 'error' ? 'error' : record.status === 'ok' ? 'ok' : '';
  if (!at || !slot || !status) {
    return null;
  }
  const error = asString(record.error);
  return {
    at,
    slot,
    status,
    ...(error ? { error } : {}),
  };
};

export const emptyHealth = (
  service: YallaServiceDefinition,
): YallaServiceHealth => ({
  serviceId: service.id,
  status: service.mode === 'proposed' ? 'proposed' : 'unknown',
  consecutiveFailures: 0,
  lastRuns: [],
});

export const mapServiceHealth = (
  service: YallaServiceDefinition,
  item?: Record<string, unknown> | null,
): YallaServiceHealth => {
  const base = emptyHealth(service);
  if (!item || service.mode === 'proposed') {
    return base;
  }
  const status =
    item.status === 'ok' || item.status === 'error' || item.status === 'unknown'
      ? item.status
      : 'unknown';
  const lastRuns = Array.isArray(item.lastRuns)
    ? item.lastRuns.map(asRun).filter((run): run is YallaServiceRun => Boolean(run))
    : [];
  const error = asString(item.error);
  const detail = asString(item.detail);
  const checkedAt = asString(item.checkedAt);
  const lastOkAt = asString(item.lastOkAt);
  const slot = asString(item.slot);
  const lastNotifiedAt = asString(item.lastNotifiedAt);
  return {
    serviceId: service.id,
    status,
    consecutiveFailures: Math.max(0, asNumber(item.consecutiveFailures)),
    lastRuns: lastRuns.slice(0, MAX_RUNS),
    ...(checkedAt ? { checkedAt } : {}),
    ...(lastOkAt ? { lastOkAt } : {}),
    ...(error ? { error } : {}),
    ...(detail ? { detail } : {}),
    ...(slot ? { slot } : {}),
    ...(lastNotifiedAt ? { lastNotifiedAt } : {}),
  };
};

export const appendServiceRun = (
  current: YallaServiceHealth,
  run: YallaServiceRun,
): YallaServiceHealth => {
  const ok = run.status === 'ok';
  return {
    ...current,
    status: ok ? 'ok' : 'error',
    checkedAt: run.at,
    slot: run.slot,
    consecutiveFailures: ok ? 0 : current.consecutiveFailures + 1,
    lastOkAt: ok ? run.at : current.lastOkAt,
    error: ok ? undefined : run.error,
    lastRuns: [run, ...current.lastRuns].slice(0, MAX_RUNS),
  };
};

export const healthRecord = (health: YallaServiceHealth) => ({
  serviceId: health.serviceId,
  status: health.status,
  checkedAt: health.checkedAt ?? '',
  lastOkAt: health.lastOkAt ?? '',
  error: health.error ?? '',
  detail: health.detail ?? '',
  slot: health.slot ?? '',
  consecutiveFailures: health.consecutiveFailures,
  lastNotifiedAt: health.lastNotifiedAt ?? '',
  lastRuns: health.lastRuns,
});

export const diagnoseSlotFromMadridTime = (
  nowTime: string,
  trigger: 'scheduled' | 'manual',
) => {
  if (trigger === 'manual') {
    return 'manual';
  }
  const hour = nowTime.slice(0, 2);
  if (hour === '08') return '08:00';
  if (hour === '14') return '14:00';
  if (hour === '20') return '20:00';
  return 'scheduled';
};

export const publicServiceCatalog = () =>
  YALLA_SERVICES.map((service) => ({
    id: service.id,
    mode: service.mode,
  }));
