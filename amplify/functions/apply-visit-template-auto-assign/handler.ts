import { applyVisitTemplateAutoAssign } from '../shared/visit-template-auto-assign';

type StreamAttributeValue = Record<string, unknown>;

const unmarshallValue = (value: StreamAttributeValue): unknown => {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('M' in value) {
    const map = value.M as Record<string, StreamAttributeValue>;
    return Object.fromEntries(
      Object.entries(map).map(([key, nested]) => [key, unmarshallValue(nested)]),
    );
  }
  if ('L' in value) {
    return (value.L as StreamAttributeValue[]).map((entry) =>
      unmarshallValue(entry),
    );
  }
  return undefined;
};

const unmarshallItem = (
  image: Record<string, StreamAttributeValue> | undefined,
) => {
  if (!image) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(image).map(([key, value]) => [key, unmarshallValue(value)]),
  ) as Record<string, unknown>;
};

type StreamRecord = {
  eventName?: string;
  dynamodb?: {
    NewImage?: Record<string, StreamAttributeValue>;
  };
};

const shouldHandleRecord = (eventName?: string) => eventName === 'INSERT';

export const handler = async (event: { Records?: StreamRecord[] }) => {
  for (const record of event.Records ?? []) {
    if (!shouldHandleRecord(record.eventName)) {
      continue;
    }
    const visit = unmarshallItem(record.dynamodb?.NewImage);
    if (!visit) {
      continue;
    }
    try {
      const result = await applyVisitTemplateAutoAssign(visit);
      console.log(
        'Visit template auto-assign',
        record.eventName,
        visit.id,
        visit.origin ?? '',
        visit.title ?? '',
        result.reason,
        result.createdTasks.length,
      );
    } catch (error) {
      console.error('Failed to auto-assign visit template', visit.id, error);
      throw error;
    }
  }
};
