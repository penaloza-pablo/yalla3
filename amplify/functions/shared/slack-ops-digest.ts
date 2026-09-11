import {
  getPlanByDate,
  isCleaningVisitType,
  queryVisitsForScheduledDate,
  scanAllItems,
} from './cleaning-plan';
import { addDaysToDateString, calendarDaysBetween } from './date-range';
import {
  queryMaintenanceTeamVisitsForDate,
  resolveMaintenanceTeamId,
} from './maintenance-plan';
import { loadSlackSecrets, slackApi } from './slack';
import { appPageUrl, escapeMrkdwn, visitAppUrl } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  claimDailySlackSend,
  isSlackNotificationEnabled,
  type SlackNotificationId,
} from './slack-notifications';
import {
  getNowTimeInMadrid,
  getTodayInMadrid,
  TERMINAL_VISIT_STATUSES,
} from './visit-task-utils';

export const PLAN_EOD_NOTIFY_TIME = '17:30';
export const INVENTORY_LATE_NOTIFY_TIME = '10:00';

const PURCHASE_WAITING_DELIVERY = 'Waiting Delivery';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const formatDayMonth = (isoDate: string) => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}`;
};

const parsePurchaseDateOnly = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return '';
};

const isOpenVisit = (visit: Record<string, unknown>) => {
  const status = asString(visit.status).toUpperCase();
  return Boolean(status) && !TERMINAL_VISIT_STATUSES.has(status);
};

const isPlanReady = (plan: Record<string, unknown> | undefined) =>
  asString(plan?.status).toUpperCase() === 'READY';

const pendingVisitLines = (visits: Record<string, unknown>[]) =>
  visits
    .map((visit) => {
      const visitId = asString(visit.id);
      if (!visitId) {
        return '';
      }
      const title =
        asString(visit.title) ||
        asString(visit.Property) ||
        asString(visit.property) ||
        visitId;
      return `• <${visitAppUrl(visitId)}|${escapeMrkdwn(title)}>`;
    })
    .filter(Boolean);

const shouldRunDaily = async (
  id: SlackNotificationId,
  today: string,
  nowTime: string,
  sendAtTime: string,
  force: boolean,
) => {
  if (!(await isSlackNotificationEnabled(id))) {
    return { run: false, skipped: 'disabled' as const };
  }
  if (!force && nowTime < sendAtTime) {
    return { run: false, skipped: 'too_early' as const };
  }
  if (!force && !(await claimDailySlackSend(id, today))) {
    return { run: false, skipped: 'already_sent' as const };
  }
  return { run: true, skipped: undefined };
};

const sendCleaningEod = async (options: {
  force: boolean;
  today: string;
  tomorrow: string;
  nowTime: string;
  visitsTable: string;
}) => {
  const gate = await shouldRunDaily(
    SLACK_NOTIFICATION_IDS.cleaningPlanEod,
    options.today,
    options.nowTime,
    PLAN_EOD_NOTIFY_TIME,
    options.force,
  );
  if (!gate.run) {
    return { sent: false, skipped: gate.skipped };
  }

  const plansTable = process.env.CLEANING_PLANS_TABLE || '';
  const tomorrowPlan = plansTable
    ? await getPlanByDate(plansTable, options.tomorrow)
    : undefined;
  const planReady = isPlanReady(tomorrowPlan);
  const todayVisits = options.visitsTable
    ? (await queryVisitsForScheduledDate(options.visitsTable, options.today)).filter(
        (visit) => isCleaningVisitType(visit.visitTypeId) && isOpenVisit(visit),
      )
    : [];

  if (planReady && todayVisits.length === 0) {
    return { sent: false, skipped: 'nothing_to_report' as const };
  }

  const { cleaningChannelId } = await loadSlackSecrets();
  if (!cleaningChannelId) {
    console.error(
      'Cleaning EOD notify skipped: missing cleaningChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const planUrl = appPageUrl('Cleaning Plan', { planDate: options.tomorrow });
  const lines: string[] = [];
  if (!planReady) {
    lines.push(
      `El <${planUrl}|plan de limpieza de mañana (${escapeMrkdwn(formatDayMonth(options.tomorrow))})> no está listo.`,
    );
  }
  if (todayVisits.length > 0) {
    const todayPlanUrl = appPageUrl('Cleaning Plan', { planDate: options.today });
    lines.push(
      `Tareas de hoy sin cerrar (<${todayPlanUrl}|abrir plan>):`,
    );
    lines.push(...pendingVisitLines(todayVisits));
  }

  await slackApi('chat.postMessage', {
    channel: cleaningChannelId,
    text: lines.join('\n'),
  });
  return { sent: true, skipped: undefined, pendingCount: todayVisits.length };
};

const sendMaintenanceEod = async (options: {
  force: boolean;
  today: string;
  tomorrow: string;
  nowTime: string;
  visitsTable: string;
}) => {
  const gate = await shouldRunDaily(
    SLACK_NOTIFICATION_IDS.maintenancePlanEod,
    options.today,
    options.nowTime,
    PLAN_EOD_NOTIFY_TIME,
    options.force,
  );
  if (!gate.run) {
    return { sent: false, skipped: gate.skipped };
  }

  const plansTable = process.env.MAINTENANCE_PLANS_TABLE || '';
  const teamsTable = process.env.TEAMS_TABLE || '';
  const tomorrowPlan = plansTable
    ? await getPlanByDate(plansTable, options.tomorrow)
    : undefined;
  const planReady = isPlanReady(tomorrowPlan);

  let todayVisits: Record<string, unknown>[] = [];
  if (options.visitsTable && teamsTable) {
    const teamId = await resolveMaintenanceTeamId(teamsTable);
    todayVisits = (
      await queryMaintenanceTeamVisitsForDate(
        options.visitsTable,
        options.today,
        teamId,
      )
    ).filter(isOpenVisit);
  }

  if (planReady && todayVisits.length === 0) {
    return { sent: false, skipped: 'nothing_to_report' as const };
  }

  const { maintenanceChannelId } = await loadSlackSecrets();
  if (!maintenanceChannelId) {
    console.error(
      'Maintenance EOD notify skipped: missing maintenanceChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const planUrl = appPageUrl('Maintenance Plan', { planDate: options.tomorrow });
  const lines: string[] = [];
  if (!planReady) {
    lines.push(
      `El <${planUrl}|plan de mantenimiento de mañana (${escapeMrkdwn(formatDayMonth(options.tomorrow))})> no está listo.`,
    );
  }
  if (todayVisits.length > 0) {
    const todayPlanUrl = appPageUrl('Maintenance Plan', {
      planDate: options.today,
    });
    lines.push(
      `Tareas de hoy sin cerrar (<${todayPlanUrl}|abrir plan>):`,
    );
    lines.push(...pendingVisitLines(todayVisits));
  }

  await slackApi('chat.postMessage', {
    channel: maintenanceChannelId,
    text: lines.join('\n'),
  });
  return { sent: true, skipped: undefined, pendingCount: todayVisits.length };
};

const purchaseName = (item: Record<string, unknown>) =>
  asString(item['Item name']) ||
  asString(item.itemName) ||
  asString(item.name) ||
  asString(item.id) ||
  'Compra';

const purchaseDeliveryRaw = (item: Record<string, unknown>) =>
  asString(item['Delivery date']) ||
  asString(item.deliveryDate) ||
  asString(item.DeliveryDate);

const sendInventoryLate = async (options: {
  force: boolean;
  today: string;
  nowTime: string;
}) => {
  const gate = await shouldRunDaily(
    SLACK_NOTIFICATION_IDS.inventoryLateDelivery,
    options.today,
    options.nowTime,
    INVENTORY_LATE_NOTIFY_TIME,
    options.force,
  );
  if (!gate.run) {
    return { sent: false, skipped: gate.skipped };
  }

  const purchasesTable = process.env.PURCHASES_TABLE || '';
  if (!purchasesTable) {
    console.error('Inventory late notify skipped: PURCHASES_TABLE is not configured.');
    return { sent: false, skipped: 'config' as const };
  }

  const latePurchases: Array<{
    name: string;
    deliveryDate: string;
    daysLate: number;
  }> = [];
  for (const item of await scanAllItems(purchasesTable)) {
    const status = asString(item.Status) || asString(item.status);
    if (status !== PURCHASE_WAITING_DELIVERY) {
      continue;
    }
    if (item.Excluded === true) {
      continue;
    }
    const deliveryDate = parsePurchaseDateOnly(purchaseDeliveryRaw(item));
    if (!deliveryDate) {
      continue;
    }
    const daysLate = calendarDaysBetween(deliveryDate, options.today);
    if (daysLate < 1) {
      continue;
    }
    latePurchases.push({
      name: purchaseName(item),
      deliveryDate,
      daysLate,
    });
  }

  if (latePurchases.length === 0) {
    return { sent: false, skipped: 'nothing_to_report' as const };
  }

  const { inventoryChannelId } = await loadSlackSecrets();
  if (!inventoryChannelId) {
    console.error(
      'Inventory late notify skipped: missing inventoryChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const purchasesUrl = appPageUrl('Purchases');
  const lines = [
    `Compras en Waiting Delivery con al menos 1 día de atraso:`,
    ...latePurchases.map((item) => {
      const delay =
        item.daysLate === 1 ? '1 día' : `${item.daysLate} días`;
      return `• ${escapeMrkdwn(item.name)} · entrega ${escapeMrkdwn(formatDayMonth(item.deliveryDate))} (${delay})`;
    }),
    `<${purchasesUrl}|Abrir compras>`,
  ];

  await slackApi('chat.postMessage', {
    channel: inventoryChannelId,
    text: lines.join('\n'),
  });
  return { sent: true, skipped: undefined, lateCount: latePurchases.length };
};

export const notifyScheduledOpsDigests = async (options?: {
  force?: boolean;
}) => {
  const force = Boolean(options?.force);
  const today = getTodayInMadrid();
  const nowTime = getNowTimeInMadrid();
  const tomorrow = addDaysToDateString(today, 1);
  const visitsTable = process.env.TABLE_NAME || process.env.VISITS_TABLE || '';

  const cleaning = await sendCleaningEod({
    force,
    today,
    tomorrow,
    nowTime,
    visitsTable,
  });
  const maintenance = await sendMaintenanceEod({
    force,
    today,
    tomorrow,
    nowTime,
    visitsTable,
  });
  const inventory = await sendInventoryLate({ force, today, nowTime });
  return { cleaning, maintenance, inventory };
};
