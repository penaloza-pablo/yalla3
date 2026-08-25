export type CleanerRecord = {
  id: string
  name: string
  active: boolean
  cleaningsCount?: number
  incidentsCount?: number
  uniqueIncidentVisitCount?: number
  historicalRating?: number
  trendRating?: number
  createdAt?: string
  updatedAt?: string
}

export type CleaningIncidentRecord = {
  id: string
  visitId: string
  visitTitle: string
  propertyId: string
  property: string
  date: string
  cleanerId: string
  cleanerName: string
  description: string
  createdAt?: string
  updatedAt?: string
}

export type CleaningPlanStatus = 'DRAFT' | 'READY'

export type CleaningPlanRow = {
  visitId: string
  propertyId: string
  title: string
  visitStatus: string
  visitStartTime: string
  cleanerId: string
  startTime: string
  qualityReview: boolean
  cleaningTypeId: string
  cleaningTypes: PropertyCleaningType[]
  guestyTaskId?: string
}

export type CleaningPlanRecord = {
  id: string
  plannedDate: string
  status: CleaningPlanStatus
  items?: Array<{
    visitId: string
    propertyId?: string
    cleanerId?: string
    startTime?: string
    qualityReview?: boolean
    cleaningTypeId?: string
    cleaningTypeName?: string
    durationHours?: number
    price?: number
  }>
  createdAt?: string
  updatedAt?: string
  readyAt?: string
}

export type PropertyCleaningType = {
  id: string
  name: string
  price: number
  durationHours: number
  isDefault: boolean
}

export type PropertyCleaningDetailsRecord = {
  id: string
  propertyId: string
  nickname: string
  cleaningTypes: PropertyCleaningType[]
  createdAt?: string
  updatedAt?: string
}

export type CleaningBillingStatus = 'CURRENT' | 'PENDING_TO_CLOSE' | 'CLOSED'
export type CleaningBillingWarning = 'open' | 'type' | 'price'
export type CleaningBillingPropertyGroup = 'p2' | 'apartments' | 'other'

export type CleaningBillingMonth = {
  id: string
  status: CleaningBillingStatus
  lineCount: number
  completedCount: number
  warningCount: number
  total: number
  canClose: boolean
  canReopen: boolean
  canEdit: boolean
  closedAt?: string
}

export type CleaningBillingLine = {
  id: string
  source: 'visit' | 'manual'
  visitId: string
  propertyId: string
  property: string
  date: string
  status: string
  cleaningTypeId: string
  cleaningTypeName: string
  price: number | null
  isOther: boolean
  isManual: boolean
  warnings: CleaningBillingWarning[]
  cleaningTypes: PropertyCleaningType[]
}

export const OTHER_CLEANING_TYPE_ID = '__other__'
