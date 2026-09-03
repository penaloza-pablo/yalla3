export const CLEANING_VISIT_TYPE_ID = 'visit_type_cleaning'
export const INVENTORY_VISIT_TYPE_ID = 'visit_type_inventory'
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

export const isInventoryVisitType = (
  visitTypeId?: string,
  visitTypeName?: string,
) => {
  const id = String(visitTypeId ?? '').trim().toLowerCase()
  const name = String(visitTypeName ?? '').trim().toLowerCase()
  return (
    id === INVENTORY_VISIT_TYPE_ID ||
    id.includes('inventory') ||
    name === 'inventory'
  )
}

export const resolveTeamIdForVisitType = (
  visitType:
    | { id?: string; name?: string; defaultTeamId?: string }
    | undefined,
  teams: { id: string; name: string }[],
  fallback = '',
) => {
  if (isInventoryVisitType(visitType?.id, visitType?.name)) {
    const maintenanceTeam = teams.find((team) =>
      team.name.toLowerCase().includes('maintenance'),
    )
    if (maintenanceTeam) {
      return maintenanceTeam.id
    }
  }
  return visitType?.defaultTeamId || fallback
}

export const requiresCompleteVisitWizard = (_visitTypeId?: string) => false
