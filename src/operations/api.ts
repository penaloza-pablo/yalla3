import type {
  TaskRecord,
  VisitRecord,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'

type ListResponse<T> = { items?: T[]; item?: T; count?: number; message?: string }

export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed (${response.status})`)
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
