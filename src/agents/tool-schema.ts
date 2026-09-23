export type ToolInputFieldType = 'string' | 'boolean' | 'number'

export type ToolInputField = {
  name: string
  type: ToolInputFieldType
  description?: string
  required: boolean
  defaultValue?: string | boolean | number
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const fieldType = (value: unknown): ToolInputFieldType => {
  if (value === 'boolean') {
    return 'boolean'
  }
  if (value === 'number' || value === 'integer') {
    return 'number'
  }
  return 'string'
}

export const toolInputFields = (schema?: Record<string, unknown>): ToolInputField[] => {
  const record = asRecord(schema)
  if (!record || record.type !== 'object') {
    return []
  }
  const properties = asRecord(record.properties) ?? {}
  const required = new Set(
    Array.isArray(record.required)
      ? record.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )
  return Object.entries(properties).map(([name, raw]) => {
    const property = asRecord(raw) ?? {}
    return {
      name,
      type: fieldType(property.type),
      description:
        typeof property.description === 'string' ? property.description : undefined,
      required: required.has(name),
      defaultValue:
        typeof property.default === 'string' ||
        typeof property.default === 'boolean' ||
        typeof property.default === 'number'
          ? property.default
          : undefined,
    }
  })
}

export const defaultToolArgumentValues = (
  fields: ToolInputField[],
): Record<string, string | boolean> => {
  const values: Record<string, string | boolean> = {}
  for (const field of fields) {
    if (field.type === 'boolean') {
      values[field.name] =
        typeof field.defaultValue === 'boolean' ? field.defaultValue : false
      continue
    }
    values[field.name] =
      field.defaultValue == null ? '' : String(field.defaultValue)
  }
  return values
}

export const collectToolArguments = (
  fields: ToolInputField[],
  values: Record<string, string | boolean>,
):
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; missing: string[] } => {
  const argumentsValue: Record<string, unknown> = {}
  const missing: string[] = []
  for (const field of fields) {
    const raw = values[field.name]
    if (field.type === 'boolean') {
      argumentsValue[field.name] = raw === true
      continue
    }
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) {
      if (field.required) {
        missing.push(field.name)
      }
      continue
    }
    if (field.type === 'number') {
      const parsed = Number(text)
      if (!Number.isFinite(parsed)) {
        missing.push(field.name)
        continue
      }
      argumentsValue[field.name] = parsed
      continue
    }
    argumentsValue[field.name] = text
  }
  if (missing.length > 0) {
    return { ok: false, missing }
  }
  return { ok: true, arguments: argumentsValue }
}
