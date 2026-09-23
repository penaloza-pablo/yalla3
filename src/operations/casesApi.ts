import { fetchJson } from './api'

export type CaseStatus = 'KNOWN' | 'QUARANTINE' | 'CLOSED'

export type CaseRecord = {
  id: string
  title: string
  description?: string
  status: CaseStatus
  propertyId: string
  propertyName?: string
  lastIssueAt?: string
  quarantineStartedAt?: string
  closedAt?: string
  visitIds: string[]
  movementIds: string[]
  taskIds: string[]
  createdAt?: string
  updatedAt?: string
}

export type CaseEvent = {
  id: string
  caseId: string
  type: 'COMMENT' | 'ISSUE'
  body: string
  createdAt: string
  createdBy?: string
}

export type CaseVisitLink = {
  id: string
  title: string
  scheduledDate: string
  propertyId: string
  price: number | null
  includedInMaintenance: boolean
}

export type CaseMovementLink = {
  id: string
  description: string
  date: string
  amount: number
  totalAmount: number
  status: string
  kind: string
}

export type CaseDetail = {
  item: CaseRecord
  events: CaseEvent[]
  visits: CaseVisitLink[]
  movements: CaseMovementLink[]
  cost: { visits: number; expenses: number; total: number }
  scopePropertyIds: string[]
}

const asStatus = (value: unknown): CaseStatus => {
  const status = String(value ?? '').toUpperCase()
  if (status === 'QUARANTINE' || status === 'CLOSED') {
    return status
  }
  return 'KNOWN'
}

export const mapCase = (item: Record<string, unknown>): CaseRecord => ({
  id: String(item.id ?? ''),
  title: String(item.title ?? ''),
  description: typeof item.description === 'string' ? item.description : '',
  status: asStatus(item.status),
  propertyId: String(item.propertyId ?? ''),
  propertyName: typeof item.propertyName === 'string' ? item.propertyName : '',
  lastIssueAt: typeof item.lastIssueAt === 'string' ? item.lastIssueAt : undefined,
  quarantineStartedAt:
    typeof item.quarantineStartedAt === 'string'
      ? item.quarantineStartedAt
      : undefined,
  closedAt: typeof item.closedAt === 'string' ? item.closedAt : undefined,
  visitIds: Array.isArray(item.visitIds) ? item.visitIds.map(String) : [],
  movementIds: Array.isArray(item.movementIds) ? item.movementIds.map(String) : [],
  taskIds: Array.isArray(item.taskIds) ? item.taskIds.map(String) : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

export const getCases = (
  endpoint: string,
  options?: { includeClosed?: boolean; q?: string; propertyId?: string },
) => {
  const params = new URLSearchParams()
  if (options?.includeClosed) params.set('includeClosed', '1')
  if (options?.q?.trim()) params.set('q', options.q.trim())
  if (options?.propertyId) params.set('propertyId', options.propertyId)
  const query = params.toString()
  return fetchJson<{
    items?: Record<string, unknown>[]
    closed?: Record<string, unknown>[]
  }>(query ? `${endpoint}?${query}` : endpoint)
}

export const getCaseDetail = (endpoint: string, id: string) =>
  fetchJson<CaseDetail>(`${endpoint}?id=${encodeURIComponent(id)}`)

export const saveCase = (endpoint: string, payload: Record<string, unknown>) =>
  fetchJson<{ item?: Record<string, unknown> }>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
