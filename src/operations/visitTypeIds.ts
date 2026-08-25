export const CLEANING_VISIT_TYPE_ID = 'visit_type_cleaning'
export const MAINTENANCE_VISIT_TYPE_ID = 'visit_type_maintenance'

export const requiresCompleteVisitWizard = (visitTypeId?: string) =>
  visitTypeId === MAINTENANCE_VISIT_TYPE_ID
