export const REPORT_WORKFLOW_STATUSES = [
  'IN_PROGRESS',
  'READY_TO_CLOSE',
  'READY_TO_PUBLISH',
  'PUBLISHED',
] as const

export type PropertyReportStatus = (typeof REPORT_WORKFLOW_STATUSES)[number]

export const isPropertyReportStatus = (
  value: string,
): value is PropertyReportStatus =>
  (REPORT_WORKFLOW_STATUSES as readonly string[]).includes(value)

export const isReportFrozen = (status: PropertyReportStatus) =>
  status === 'READY_TO_PUBLISH' || status === 'PUBLISHED'

export const isReportPreliminary = (status: PropertyReportStatus) =>
  status === 'IN_PROGRESS' || status === 'READY_TO_CLOSE'

export const previousReportStatus = (
  status: PropertyReportStatus,
): PropertyReportStatus => {
  if (status === 'PUBLISHED') {
    return 'READY_TO_PUBLISH'
  }
  if (status === 'READY_TO_PUBLISH') {
    return 'READY_TO_CLOSE'
  }
  return 'IN_PROGRESS'
}

export const deriveReportStatus = (
  _monthId: string,
  storedStatus?: string,
): PropertyReportStatus => {
  const stored =
    typeof storedStatus === 'string' ? storedStatus.trim().toUpperCase() : ''
  if (stored === 'PUBLISHED' || stored === 'CLOSED') {
    return 'PUBLISHED'
  }
  if (stored === 'READY_TO_PUBLISH') {
    return 'READY_TO_PUBLISH'
  }
  if (stored === 'READY_TO_CLOSE') {
    return 'READY_TO_CLOSE'
  }
  return 'IN_PROGRESS'
}
