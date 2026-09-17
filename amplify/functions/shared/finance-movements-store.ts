import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { scanAllItems } from './cleaning-plan';
import { nowIso } from './dynamo-http';
import {
  asNumber,
  asString,
  dueBillingDatesInMonth,
  generatedBillingItemId,
  isMovementScheduleRecord,
  isScheduleEnabled,
  occurrencePriceWithIva,
  persistIvaFields,
  resolveIvaRate,
  roundMoney,
  shouldAutoDisableSchedule,
  shouldCreateBillingOnDate,
  type FinanceCustomUnit,
  type FinanceRecurrence,
} from './finance-services';
import {
  parseCostDefaultAllocation,
  parseIncomeDefaultAllocation,
} from './property-report-allocations';
import { docClient, getTodayInMadrid, putItem } from './visit-task-utils';

export const currentFinanceMonthId = () => getTodayInMadrid().slice(0, 7);

const parseKind = (value: unknown) =>
  asString(value).toLowerCase() === 'income' ? 'income' : 'outcome';

const parseStatus = (value: unknown) => {
  const status = asString(value);
  if (status === 'Billed' || status === 'Not Billable' || status === 'Pending Billing') {
    return status;
  }
  return 'Pending Billing';
};

const parseScheduleAllocation = (schedule: Record<string, unknown>) => {
  const raw = schedule.defaultAllocation ?? schedule.allocation;
  return parseKind(schedule.kind) === 'income'
    ? parseIncomeDefaultAllocation(raw)
    : parseCostDefaultAllocation(raw);
};

export const movementItemFromSchedule = (
  schedule: Record<string, unknown>,
  date: string,
) => {
  const scheduleId = asString(schedule.id);
  const amount = roundMoney(Math.max(0, asNumber(schedule.amount) ?? 0));
  const ivaRate = resolveIvaRate(schedule);
  const storedTotal = asNumber(schedule.totalAmount);
  const timestamp = nowIso();
  const allocation = parseScheduleAllocation(schedule);
  return {
    id: generatedBillingItemId(scheduleId, date),
    recordType: 'item' as const,
    scheduleId,
    propertyId: asString(schedule.propertyId),
    propertyName: asString(schedule.propertyName) || undefined,
    description: asString(schedule.description),
    amount,
    ...persistIvaFields(ivaRate),
    totalAmount:
      storedTotal !== null
        ? roundMoney(Math.max(0, storedTotal))
        : occurrencePriceWithIva(amount, ivaRate),
    kind: parseKind(schedule.kind),
    status: parseStatus(schedule.status),
    date,
    recurrence: asString(schedule.recurrence) || undefined,
    customInterval: asNumber(schedule.customInterval) ?? undefined,
    customUnit: asString(schedule.customUnit) || undefined,
    ...(allocation ? { allocation } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const materializeMovementMonth = async (
  tableName: string,
  monthId: string,
  scheduleId?: string,
) => {
  const records = await scanAllItems(tableName);
  const existingIds = new Set(
    records
      .filter((item) => !isMovementScheduleRecord(item))
      .map((item) => asString(item.id))
      .filter(Boolean),
  );
  const schedules = records.filter(
    (item) =>
      isMovementScheduleRecord(item) &&
      (!scheduleId || asString(item.id) === scheduleId),
  );
  let created = 0;
  const today = getTodayInMadrid();
  for (const schedule of schedules) {
    if (shouldAutoDisableSchedule(schedule, today)) {
      await putItem(tableName, {
        ...schedule,
        enabled: false,
        updatedAt: nowIso(),
      });
      continue;
    }
    if (!isScheduleEnabled(schedule)) {
      continue;
    }
    const dates = dueBillingDatesInMonth(
      {
        startDate: asString(schedule.startDate).slice(0, 10),
        recurrence: asString(schedule.recurrence) as FinanceRecurrence,
        customInterval: asNumber(schedule.customInterval) ?? undefined,
        customUnit: asString(schedule.customUnit) as FinanceCustomUnit | '',
      },
      monthId,
    );
    for (const date of dates) {
      if (!shouldCreateBillingOnDate(schedule, date)) {
        continue;
      }
      const id = generatedBillingItemId(asString(schedule.id), date);
      if (existingIds.has(id)) {
        continue;
      }
      const found = await docClient.send(
        new GetCommand({ TableName: tableName, Key: { id } }),
      );
      if (found.Item) {
        existingIds.add(id);
        continue;
      }
      await putItem(tableName, movementItemFromSchedule(schedule, date));
      existingIds.add(id);
      created += 1;
    }
  }
  return { created, monthId };
};

export const materializeCurrentMovementMonth = async (
  tableName: string,
  scheduleId?: string,
) => materializeMovementMonth(tableName, currentFinanceMonthId(), scheduleId);
