export type WorkspaceKind = 'office' | 'field'

/** Knock-Knock Manager, Cleaner Supervisor, Admin — primary use is desktop. */
export const OFFICE_ROLE_IDS = new Set([
  'admin',
  'knock-knock-supervisor',
  'cleaning-supervisor',
])

/** Cleaner, Maintenance Agent, Maintenance Supervisor — primary use is PWA in the field. */
export const FIELD_ROLE_IDS = new Set([
  'cleaner',
  'maintenance-agent',
  'maintenance-supervisor',
])

export const workspaceForRole = (roleId: string | null): WorkspaceKind => {
  if (roleId && FIELD_ROLE_IDS.has(roleId)) {
    return 'field'
  }
  return 'office'
}

/** Primary destinations for the field bottom nav (excludes "More"). */
export const fieldMobileTabs = (roleId: string | null): string[] => {
  switch (roleId) {
    case 'cleaner':
      return ['Daily Operations', 'Cleaning Plan', 'Cleaning Incidents']
    case 'maintenance-agent':
      return ['Daily Operations', 'Maintenance Plan', 'Maintenance Incidents']
    case 'maintenance-supervisor':
      return ['Daily Operations', 'Maintenance Plan', 'Inventory']
    default:
      return []
  }
}
