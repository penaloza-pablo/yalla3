const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isMissingRequiredValue = (value: unknown, propertySchema: unknown) => {
  if (value == null) {
    return true;
  }
  const type =
    propertySchema &&
    typeof propertySchema === 'object' &&
    !Array.isArray(propertySchema) &&
    typeof (propertySchema as { type?: unknown }).type === 'string'
      ? (propertySchema as { type: string }).type
      : undefined;
  if (type === 'string' && typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
};

export const validateAgainstSchema = (
  schema: Record<string, unknown> | undefined,
  value: unknown,
): { ok: true } | { ok: false; message: string } => {
  if (!schema || schema.type !== 'object') {
    return { ok: true };
  }
  const record = asRecord(value);
  if (!record) {
    return { ok: false, message: 'Tool arguments must be an object.' };
  }
  const properties = asRecord(schema.properties) ?? {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === 'string')
    : [];
  for (const key of required) {
    if (!(key in record) || isMissingRequiredValue(record[key], properties[key])) {
      return { ok: false, message: `Missing required argument: ${key}.` };
    }
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) {
        return { ok: false, message: `Unexpected argument: ${key}.` };
      }
    }
  }
  return { ok: true };
};
