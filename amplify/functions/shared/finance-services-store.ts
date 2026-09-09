import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { scanAllItems } from './cleaning-plan';
import {
  asNumber,
  asString,
  dueBillingDatesInMonth,
  generatedBillingItemId,
  isBillingItemRecord,
  isDateOnly,
  isScheduleRecord,
  occurrencePriceWithIva,
  persistIvaFields,
  resolveIvaRate,
  roundMoney,
  type FinanceCustomUnit,
  type FinanceRecurrence,
  type FinanceServiceType,
} from './finance-services';
import { nowIso } from './dynamo-http';
import { docClient, getTodayInMadrid, putItem } from './visit-task-utils';

export const currentFinanceMonthId = () => getTodayInMadrid().slice(0, 7);

const asScheduleLike = (item: Record<string, unknown>) => ({
  id: asString(item.id),
  type: (asString(item.type) === 'ops' ? 'ops' : 'apartment') as FinanceServiceType,
  propertyId: asString(item.propertyId),
  propertyName: asString(item.propertyName),
  title: asString(item.title),
  recurrence: asString(item.recurrence) as FinanceRecurrence,
  startDate: asString(item.startDate).slice(0, 10),
  customInterval: asNumber(item.customInterval) ?? undefined,
  customUnit: asString(item.customUnit) as FinanceCustomUnit | '',
  priceMode:
    asString(item.priceMode) === 'fixed' || asNumber(item.price)
      ? ('fixed' as const)
      : ('variable' as const),
  price: roundMoney(Math.max(0, asNumber(item.price) ?? 0)),
  ivaRate: resolveIvaRate(item),
});

export const billingItemFromSchedule = (
  schedule: Record<string, unknown>,
  billingDate: string,
) => {
  const parsed = asScheduleLike(schedule);
  const price = parsed.priceMode === 'fixed' ? parsed.price : 0;
  const ivaRate = parsed.priceMode === 'fixed' ? parsed.ivaRate : 0;
  const timestamp = nowIso();
  return {
    id: generatedBillingItemId(parsed.id, billingDate),
    recordType: 'item' as const,
    scheduleId: parsed.id,
    type: parsed.type,
    propertyId: parsed.propertyId || undefined,
    propertyName: parsed.propertyName || undefined,
    title: parsed.title,
    recurrence: parsed.recurrence,
    customInterval: parsed.customInterval,
    customUnit: parsed.customUnit || undefined,
    billingDate,
    period: billingDate.slice(0, 7),
    price,
    ...persistIvaFields(ivaRate),
    priceWithIva: occurrencePriceWithIva(price, ivaRate),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const purgeLegacyNestedItems = async (
  tableName: string,
  records: Record<string, unknown>[],
) => {
  let purged = 0;
  for (const record of records) {
    if (!isScheduleRecord(record)) {
      continue;
    }
    if (!Array.isArray(record.items) || record.items.length === 0) {
      continue;
    }
    const next = { ...record, items: [], updatedAt: nowIso() };
    await putItem(tableName, next);
    purged += 1;
  }
  return purged;
};

export const materializeMonth = async (
  tableName: string,
  monthId: string,
  scheduleId?: string,
) => {
  const records = await scanAllItems(tableName);
  const purged = await purgeLegacyNestedItems(tableName, records);
  const existingIds = new Set(
    records
      .filter(isBillingItemRecord)
      .map((item) => asString(item.id))
      .filter(Boolean),
  );
  const schedules = records.filter(
    (item) =>
      isScheduleRecord(item) &&
      (!scheduleId || asString(item.id) === scheduleId),
  );
  let created = 0;
  for (const schedule of schedules) {
    const dates = dueBillingDatesInMonth(
      {
        startDate: asString(schedule.startDate).slice(0, 10),
        recurrence: asString(schedule.recurrence) as FinanceRecurrence,
        customInterval: asNumber(schedule.customInterval) ?? undefined,
        customUnit: asString(schedule.customUnit) as FinanceCustomUnit | '',
      },
      monthId,
    );
    for (const billingDate of dates) {
      if (!isDateOnly(billingDate)) {
        continue;
      }
      const id = generatedBillingItemId(asString(schedule.id), billingDate);
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
      await putItem(tableName, billingItemFromSchedule(schedule, billingDate));
      existingIds.add(id);
      created += 1;
    }
  }
  return { created, purged, monthId };
};

export const materializeCurrentMonth = async (
  tableName: string,
  scheduleId?: string,
) => materializeMonth(tableName, currentFinanceMonthId(), scheduleId);

export const deleteFinanceRecord = async (tableName: string, id: string) => {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    }),
  );
};
