const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

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
    if (!(key in record)) {
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
