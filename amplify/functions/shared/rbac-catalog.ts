export type NavGroup = {
  section: string
  items: string[]
}

export const CORE_PAGES = ['Daily Operations'] as const

export const NAVIGATION: NavGroup[] = [
  {
    section: 'Inventory',
    items: ['Inventory', 'Spot Check', 'Purchases', 'Subtractions'],
  },
  {
    section: 'Ops',
    items: [
      'Properties',
      'Bookings',
      'Reviews',
      'Unassigned tasks',
      'Visit templates',
    ],
  },
  {
    section: 'Cleaning',
    items: [
      'Cleaning Plan',
      'Cleaning Incidents',
      'Cleaning Billing',
      'Cleaning settings',
    ],
  },
  {
    section: 'Maintenance',
    items: [
      'Maintenance Incidents',
      'Maintenance Billing',
      'Maintenance settings',
    ],
  },
  {
    section: 'Settings',
    items: ['Logs', 'Users', 'Roles'],
  },
  {
    section: 'Grow',
    items: ['Grow solution 1', 'Grow solution 2', 'Grow solution 3'],
  },
  {
    section: 'Finance',
    items: ['Finance solution 1', 'Finance solution 2', 'Finance solution 3'],
  },
]

export const ALL_PAGES: string[] = [
  ...CORE_PAGES,
  ...NAVIGATION.flatMap((group) => group.items),
]

export const pagePermission = (page: string) => `page:${page}`

export const ACTION_KEYS = {
  cleaningCloseMonth: 'action:cleaningBilling.closeMonth',
  maintenanceCloseMonth: 'action:maintenanceBilling.closeMonth',
  maintenanceCheckAfterEstimate: 'action:maintenanceBilling.checkAfterEstimate',
  visitMoreInfo: 'action:visit.moreInfo',
  dailyOpsCreate: 'action:dailyOps.create',
  inventoryCreate: 'action:inventory.create',
  spotCheckCreate: 'action:spotCheck.create',
  purchasesCreate: 'action:purchases.create',
  propertiesUpdateFromGuesty: 'action:properties.updateFromGuesty',
} as const

export const ACTION_DEFINITIONS: { key: string; i18nKey: string }[] = [
  {
    key: ACTION_KEYS.cleaningCloseMonth,
    i18nKey: 'rbac.actions.cleaningCloseMonth',
  },
  {
    key: ACTION_KEYS.maintenanceCloseMonth,
    i18nKey: 'rbac.actions.maintenanceCloseMonth',
  },
  {
    key: ACTION_KEYS.maintenanceCheckAfterEstimate,
    i18nKey: 'rbac.actions.maintenanceCheckAfterEstimate',
  },
  { key: ACTION_KEYS.visitMoreInfo, i18nKey: 'rbac.actions.visitMoreInfo' },
  { key: ACTION_KEYS.dailyOpsCreate, i18nKey: 'rbac.actions.dailyOpsCreate' },
  { key: ACTION_KEYS.inventoryCreate, i18nKey: 'rbac.actions.inventoryCreate' },
  { key: ACTION_KEYS.spotCheckCreate, i18nKey: 'rbac.actions.spotCheckCreate' },
  { key: ACTION_KEYS.purchasesCreate, i18nKey: 'rbac.actions.purchasesCreate' },
  {
    key: ACTION_KEYS.propertiesUpdateFromGuesty,
    i18nKey: 'rbac.actions.propertiesUpdateFromGuesty',
  },
]

export const ALL_ACTION_KEYS = ACTION_DEFINITIONS.map((entry) => entry.key)

export const allPermissionKeys = () => [
  ...ALL_PAGES.map(pagePermission),
  ...ALL_ACTION_KEYS,
]

const pages = (...names: string[]) => names.map(pagePermission)

export const ADMIN_ROLE_ID = 'admin'
export const KNOCK_KNOCK_SUPERVISOR_ROLE_ID = 'knock-knock-supervisor'

export const canViewMaintenanceHoursRemaining = (roleId?: string | null) =>
  roleId === ADMIN_ROLE_ID || roleId === KNOCK_KNOCK_SUPERVISOR_ROLE_ID

export const ROLE_SEEDS: {
  id: string
  name: string
  permissions: string[]
}[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'admin',
    permissions: allPermissionKeys(),
  },
  {
    id: KNOCK_KNOCK_SUPERVISOR_ROLE_ID,
    name: 'Knock-Knock Supervisor',
    permissions: [
      ...pages(
        ...ALL_PAGES.filter(
          (page) =>
            page !== 'Users' &&
            page !== 'Roles' &&
            !page.startsWith('Grow solution') &&
            !page.startsWith('Finance solution'),
        ),
      ),
      ...ALL_ACTION_KEYS,
    ],
  },
  {
    id: 'cleaning-supervisor',
    name: 'cleaning supervisor',
    permissions: [
      ...pages(
        'Daily Operations',
        'Inventory',
        'Spot Check',
        'Purchases',
        'Subtractions',
        'Properties',
        'Bookings',
        'Reviews',
        'Unassigned tasks',
        'Visit templates',
        'Cleaning Plan',
        'Cleaning Incidents',
        'Cleaning Billing',
        'Cleaning settings',
      ),
      ACTION_KEYS.cleaningCloseMonth,
      ACTION_KEYS.dailyOpsCreate,
      ACTION_KEYS.inventoryCreate,
      ACTION_KEYS.spotCheckCreate,
      ACTION_KEYS.purchasesCreate,
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.propertiesUpdateFromGuesty,
    ],
  },
  {
    id: 'cleaner',
    name: 'cleaner',
    permissions: [
      ...pages('Daily Operations', 'Cleaning Plan', 'Cleaning Incidents'),
      ACTION_KEYS.visitMoreInfo,
    ],
  },
  {
    id: 'maintenance-supervisor',
    name: 'maintenance supervisor',
    permissions: [
      ...pages(
        'Daily Operations',
        'Inventory',
        'Properties',
        'Bookings',
        'Unassigned tasks',
        'Maintenance Incidents',
        'Maintenance Billing',
        'Maintenance settings',
      ),
      ACTION_KEYS.maintenanceCloseMonth,
      ACTION_KEYS.maintenanceCheckAfterEstimate,
      ACTION_KEYS.dailyOpsCreate,
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.propertiesUpdateFromGuesty,
    ],
  },
  {
    id: 'maintenance-agent',
    name: 'maintenance agent',
    permissions: [
      ...pages('Daily Operations', 'Maintenance Incidents'),
      ACTION_KEYS.visitMoreInfo,
    ],
  },
]

export const ROLE_IDS = ROLE_SEEDS.map((role) => role.id)

export const isKnownRoleId = (roleId: string) => ROLE_IDS.includes(roleId)

export const isKnownPermission = (key: string) =>
  allPermissionKeys().includes(key)
