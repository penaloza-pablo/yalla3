import type {
  TaskRecord,
  VisitRecord,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'
import { authFetch } from '../lib/auth-fetch'

type ListResponse<T> = { items?: T[]; item?: T; count?: number; message?: string }

export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await authFetch(url, init)
  if (!response.ok) {
    const text = await response.text()
    let message = text || `Request failed (${response.status})`
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (parsed.message) {
        message = parsed.message
      }
    } catch {
      // Keep the raw response text when it is not JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export const getVisitsByDate = (endpoint: string, scheduledDate: string) =>
  fetchJson<ListResponse<VisitRecord>>(
    `${endpoint}?scheduledDate=${encodeURIComponent(scheduledDate)}`,
  )

export const getVisitsByDateRange = (
  endpoint: string,
  scheduledDateFrom: string,
  scheduledDateTo: string,
) =>
  fetchJson<ListResponse<VisitRecord>>(
    `${endpoint}?scheduledDateFrom=${encodeURIComponent(scheduledDateFrom)}&scheduledDateTo=${encodeURIComponent(scheduledDateTo)}`,
  )

export const getVisitById = (endpoint: string, id: string) =>
  fetchJson<ListResponse<VisitRecord>>(`${endpoint}?id=${encodeURIComponent(id)}`)

export const saveVisit = (endpoint: string, payload: Record<string, unknown>) =>
  fetchJson<ListResponse<VisitRecord>>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const canRefreshVisitFromGuesty = (visit: {
  id: string
  guestyTaskId?: string
}) => Boolean(visit.guestyTaskId?.trim()) || visit.id.startsWith('GST-')

export const refreshVisitFromGuesty = (endpoint: string, id: string) =>
  fetchJson<ListResponse<VisitRecord> & { changed?: boolean }>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: 'refreshFromGuesty' }),
  })

export const getTasksByVisit = (endpoint: string, visitId: string) =>
  fetchJson<ListResponse<TaskRecord>>(
    `${endpoint}?visitId=${encodeURIComponent(visitId)}`,
  )

export const getUnassignedPool = (endpoint: string) =>
  fetchJson<ListResponse<TaskRecord>>(`${endpoint}?pool=unassigned`)

export const saveTask = (endpoint: string, payload: Record<string, unknown>) =>
  fetchJson<ListResponse<TaskRecord>>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getBookingsForDay = (
  endpoint: string,
  date: string,
  status = 'confirmed',
) => {
  const params = new URLSearchParams()
  params.set('onDate', date)
  if (status) {
    params.set('status', status)
  }
  params.set('limit', '200')
  return fetchJson<ListResponse<Record<string, unknown>>>(
    `${endpoint}?${params.toString()}`,
  )
}

export const getReferenceList = (endpoint: string, teamId?: string) => {
  const url = teamId
    ? `${endpoint}?teamId=${encodeURIComponent(teamId)}`
    : endpoint
  return fetchJson<ListResponse<Record<string, unknown>>>(url)
}

export const getVisitTemplates = (
  endpoint: string,
  options?: { propertyId?: string; id?: string; includeInactive?: boolean },
) => {
  const params = new URLSearchParams()
  if (options?.propertyId) {
    params.set('propertyId', options.propertyId)
  }
  if (options?.id) {
    params.set('id', options.id)
  }
  if (options?.includeInactive) {
    params.set('includeInactive', 'true')
  }
  const query = params.toString()
  return fetchJson<ListResponse<VisitTemplateRecord>>(
    query ? `${endpoint}?${query}` : endpoint,
  )
}

export const saveVisitTemplate = (
  endpoint: string,
  payload: Record<string, unknown>,
) =>
  fetchJson<ListResponse<VisitTemplateRecord>>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const saveVisitType = (endpoint: string, payload: Record<string, unknown>) =>
  fetchJson<ListResponse<VisitTypeRecord>>(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
