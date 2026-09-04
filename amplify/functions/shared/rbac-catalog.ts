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
      'Maintenance Plan',
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
  maintenanceBillingHoursRemaining: 'action:maintenanceBilling.hoursRemaining',
  dashboardCardCleaning: 'action:dashboard.card.cleaning',
  dashboardCardMaintenance: 'action:dashboard.card.maintenance',
  dashboardCardOps: 'action:dashboard.card.ops',
  dashboardCardInventory: 'action:dashboard.card.inventory',
  visitMoreInfo: 'action:visit.moreInfo',
  dailyOpsCreate: 'action:dailyOps.create',
  inventoryCreate: 'action:inventory.create',
  spotCheckCreate: 'action:spotCheck.create',
  purchasesCreate: 'action:purchases.create',
  propertiesUpdateFromGuesty: 'action:properties.updateFromGuesty',
  unassignedTasksEdit: 'action:unassignedTasks.edit',
  maintenanceBillingEdit: 'action:maintenanceBilling.edit',
  cleaningBillingEdit: 'action:cleaningBilling.edit',
  cleaningBillingPrices: 'action:cleaningBilling.prices',
  createTasks: 'action:createTasks',
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
  {
    key: ACTION_KEYS.maintenanceBillingHoursRemaining,
    i18nKey: 'rbac.actions.maintenanceBillingHoursRemaining',
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
  {
    key: ACTION_KEYS.unassignedTasksEdit,
    i18nKey: 'rbac.actions.unassignedTasksEdit',
  },
  {
    key: ACTION_KEYS.maintenanceBillingEdit,
    i18nKey: 'rbac.actions.maintenanceBillingEdit',
  },
  {
    key: ACTION_KEYS.cleaningBillingEdit,
    i18nKey: 'rbac.actions.cleaningBillingEdit',
  },
  {
    key: ACTION_KEYS.cleaningBillingPrices,
    i18nKey: 'rbac.actions.cleaningBillingPrices',
  },
  { key: ACTION_KEYS.createTasks, i18nKey: 'rbac.actions.createTasks' },
]

export const DASHBOARD_CARD_DEFINITIONS: { key: string; i18nKey: string }[] = [
  {
    key: ACTION_KEYS.dashboardCardCleaning,
    i18nKey: 'rbac.actions.dashboardCardCleaning',
  },
  {
    key: ACTION_KEYS.dashboardCardMaintenance,
    i18nKey: 'rbac.actions.dashboardCardMaintenance',
  },
  {
    key: ACTION_KEYS.dashboardCardOps,
    i18nKey: 'rbac.actions.dashboardCardOps',
  },
  {
    key: ACTION_KEYS.dashboardCardInventory,
    i18nKey: 'rbac.actions.dashboardCardInventory',
  },
]

export const DASHBOARD_CARD_KEYS = DASHBOARD_CARD_DEFINITIONS.map(
  (entry) => entry.key,
)

export const withDefaultDashboardCardPermissions = (permissions: string[]) => {
  if (DASHBOARD_CARD_KEYS.some((key) => permissions.includes(key))) {
    return permissions
  }
  return [...permissions, ...DASHBOARD_CARD_KEYS]
}

export const ALL_ACTION_KEYS = [
  ...ACTION_DEFINITIONS.map((entry) => entry.key),
  ...DASHBOARD_CARD_KEYS,
]

export const allPermissionKeys = () => [
  ...ALL_PAGES.map(pagePermission),
  ...ALL_ACTION_KEYS,
]

const pages = (...names: string[]) => names.map(pagePermission)

export const ADMIN_ROLE_ID = 'admin'
export const KNOCK_KNOCK_SUPERVISOR_ROLE_ID = 'knock-knock-supervisor'

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
      ACTION_KEYS.cleaningBillingPrices,
      ACTION_KEYS.dailyOpsCreate,
      ACTION_KEYS.inventoryCreate,
      ACTION_KEYS.spotCheckCreate,
      ACTION_KEYS.purchasesCreate,
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.propertiesUpdateFromGuesty,
      ACTION_KEYS.createTasks,
      ACTION_KEYS.dashboardCardCleaning,
      ACTION_KEYS.dashboardCardOps,
      ACTION_KEYS.dashboardCardInventory,
    ],
  },
  {
    id: 'cleaner',
    name: 'cleaner',
    permissions: [
      ...pages('Daily Operations', 'Cleaning Plan', 'Cleaning Incidents'),
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.dashboardCardCleaning,
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
        'Maintenance Plan',
        'Maintenance Incidents',
        'Maintenance Billing',
        'Maintenance settings',
      ),
      ACTION_KEYS.maintenanceCloseMonth,
      ACTION_KEYS.maintenanceCheckAfterEstimate,
      ACTION_KEYS.dailyOpsCreate,
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.propertiesUpdateFromGuesty,
      ACTION_KEYS.createTasks,
      ACTION_KEYS.dashboardCardMaintenance,
      ACTION_KEYS.dashboardCardOps,
      ACTION_KEYS.dashboardCardInventory,
    ],
  },
  {
    id: 'maintenance-agent',
    name: 'maintenance agent',
    permissions: [
      ...pages('Daily Operations', 'Maintenance Plan', 'Maintenance Incidents'),
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.dashboardCardMaintenance,
    ],
  },
]

export const ROLE_IDS = ROLE_SEEDS.map((role) => role.id)

export const isKnownRoleId = (roleId: string) => ROLE_IDS.includes(roleId)

export const isKnownPermission = (key: string) =>
  allPermissionKeys().includes(key)
