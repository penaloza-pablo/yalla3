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
