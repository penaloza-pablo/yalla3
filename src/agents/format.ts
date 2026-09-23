export const formatWhen = (value: string | undefined, locale: string) => {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString(locale.startsWith('es') ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatToolOutput = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

export const formatDuration = (latencyMs?: number) => {
  if (latencyMs == null || !Number.isFinite(latencyMs)) {
    return '—'
  }
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)} ms`
  }
  return `${(latencyMs / 1000).toFixed(1)} s`
}

export const formatCost = (usd?: number) => {
  if (usd == null || !Number.isFinite(usd)) {
    return '—'
  }
  return `$${usd.toFixed(4)}`
}

export const shortRunId = (runId: string) => runId.slice(0, 8)
