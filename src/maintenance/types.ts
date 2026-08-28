export const OTHER_PROVIDER_ID = '__other__'

export const MAINTENANCE_BILLING_LINE_STATUSES = [
  'TO_ESTIMATE',
  'WAITING_APPROVAL',
  'APPROVED',
  'BILLED',
  'PAID',
] as const

export type MaintenanceBillingLineStatus =
  (typeof MAINTENANCE_BILLING_LINE_STATUSES)[number]

export type ProviderRecord = {
  id: string
  name: string
  active: boolean
  jobsCount?: number
  incidentsCount?: number
  createdAt?: string
  updatedAt?: string
}

export type MaintenanceIncidentRecord = {
  id: string
  visitId: string
  visitTitle: string
  propertyId: string
  property: string
  date: string
  providerId: string
  providerName: string
  isOtherProvider?: boolean
  description: string
  createdAt?: string
  updatedAt?: string
}

export type VisitTypeHours = {
  visitTypeId: string
  visitTypeName: string
  hours: number
}

export type MaintenanceSettings = {
  id: string
  monthlyHoursPool: number
  hourlyCost: number
  defaultProviderId: string
  defaultProviderName: string
  visitTypeHours: VisitTypeHours[]
}

export type VisitTypeOption = {
  id: string
  name: string
  active: boolean
}

export type MaintenanceBillingMonthStatus =
  | 'CURRENT'
  | 'PENDING_TO_CLOSE'
  | 'CLOSED'

export type MaintenanceBillingMonth = {
  id: string
  status: MaintenanceBillingMonthStatus
  lineCount: number
  completedCount: number
  warningCount: number
  total: number
  validatedHours: number
  canClose: boolean
  canReopen: boolean
  canEdit: boolean
  closedAt?: string
}

export type MaintenanceBillingLine = {
  id: string
  source: 'visit' | 'manual'
  visitId: string
  title: string
  visitTypeId: string
  visitTypeName: string
  propertyId: string
  property: string
  date: string
  status: string
  providerId: string
  providerName: string
  hours: number | null
  hoursDisabled: boolean
  price: number | null
  billingStatus: MaintenanceBillingLineStatus
  isManual: boolean
}

export const nextBillingLineStatus = (status: MaintenanceBillingLineStatus) => {
  const index = MAINTENANCE_BILLING_LINE_STATUSES.indexOf(status)
  if (index < 0 || index >= MAINTENANCE_BILLING_LINE_STATUSES.length - 1) {
    return null
  }
  return MAINTENANCE_BILLING_LINE_STATUSES[index + 1]
}

export const isApprovedOrAbove = (status: string) =>
  status === 'APPROVED' || status === 'BILLED' || status === 'PAID'
