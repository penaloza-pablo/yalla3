export const CLEANING_VISIT_TYPE_ID = 'visit_type_cleaning'
export const MAINTENANCE_VISIT_TYPE_ID = 'visit_type_maintenance'
export const MAINTENANCE_VISIT_TYPE_IDS = [
  'visit_type_maintenance',
  'visit_type_deep_property_check',
  'visit_type_property_check',
  'visit_type_fixings',
  'visit_type_emergency',
] as const

export const isMaintenanceVisitType = (visitTypeId?: string) =>
  Boolean(
    visitTypeId &&
      (MAINTENANCE_VISIT_TYPE_IDS as readonly string[]).includes(visitTypeId),
  )

export const requiresCompleteVisitWizard = (_visitTypeId?: string) => false
