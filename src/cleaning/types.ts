export type CleanerRecord = {
  id: string
  name: string
  active: boolean
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
  }>
  createdAt?: string
  updatedAt?: string
  readyAt?: string
}
