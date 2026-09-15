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
      'Unassigned tasks',
      'Visit templates',
      'Template Auto Assign',
      'Job scheduler',
    ],
  },
  {
    section: 'Bookings',
    items: ['Bookings', 'Bookings Plan', 'Reviews', 'Bookings settings'],
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
    items: ['Logs', 'Users', 'Roles', 'Slack', 'Global Variables'],
  },
  {
    section: 'Grow',
    items: ['Grow solution 1', 'Grow solution 2', 'Grow solution 3'],
  },
  {
    section: 'Finance',
    items: [
      'Property Reports',
      'Reports Settings',
      'Property Groups',
      'Movements',
      'Services & Subscriptions',
    ],
  },
  {
    section: 'Visual',
    items: [
      'Visual Buttons',
      'Visual Messages',
      'Visual Action bars',
      'Visual Cards',
      'Visual Inputs',
      'Visual Tokens',
      'Visual Icons',
      'Visual Widgets',
      'Visual Lab',
    ],
  },
]

export const ALL_PAGES: string[] = [
  ...CORE_PAGES,
  ...NAVIGATION.flatMap((group) => group.items),
]

export const pagePermission = (page: string) => `page:${page}`

export const ACTION_KEYS = {
  propertyReportsCloseMonth: 'action:propertyReports.closeMonth',
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
  inventoryEditItems: 'action:inventory.editItems',
  spotCheckCreate: 'action:spotCheck.create',
  purchasesCreate: 'action:purchases.create',
  propertiesUpdateFromGuesty: 'action:properties.updateFromGuesty',
  unassignedTasksEdit: 'action:unassignedTasks.edit',
  maintenanceBillingEdit: 'action:maintenanceBilling.edit',
  cleaningBillingEdit: 'action:cleaningBilling.edit',
  cleaningBillingPrices: 'action:cleaningBilling.prices',
  createTasks: 'action:createTasks',
  dashboardConfigureWidgets: 'action:dashboard.configureWidgets',
} as const

export const ACTION_DEFINITIONS: { key: string; i18nKey: string }[] = [
  {
    key: ACTION_KEYS.propertyReportsCloseMonth,
    i18nKey: 'rbac.actions.propertyReportsCloseMonth',
  },
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
  {
    key: ACTION_KEYS.inventoryEditItems,
    i18nKey: 'rbac.actions.inventoryEditItems',
  },
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
  {
    key: ACTION_KEYS.dashboardConfigureWidgets,
    i18nKey: 'rbac.actions.dashboardConfigureWidgets',
  },
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

export const isKnownPermission = (key: string) =>
  allPermissionKeys().includes(key)

export const ADMIN_ROLE_ID = 'admin'
export const KNOCK_KNOCK_SUPERVISOR_ROLE_ID = 'knock-knock-supervisor'

export const ADMIN_LOCKED_PAGES = ['Roles'] as const

export const isAdminLockedPage = (page: string) =>
  (ADMIN_LOCKED_PAGES as readonly string[]).includes(page)

export const PERMISSIONS_CATALOG_VERSION = 3

export const applyPermissionCatalog = (
  permissions: string[],
  storedVersion?: unknown,
) => {
  let next = permissions.filter(isKnownPermission)
  const from =
    typeof storedVersion === 'number' && Number.isFinite(storedVersion)
      ? Math.floor(storedVersion)
      : 1
  if (from < 2) {
    const hasSettingsPage = next.some(
      (key) =>
        key === pagePermission('Logs') ||
        key === pagePermission('Users') ||
        key === pagePermission('Roles') ||
        key === pagePermission('Slack'),
    )
    if (hasSettingsPage && !next.includes(pagePermission('Global Variables'))) {
      next.push(pagePermission('Global Variables'))
    }
    const canConfigureWidgets =
      next.includes(pagePermission('Daily Operations')) &&
      (next.includes(ACTION_KEYS.dailyOpsCreate) ||
        next.includes(pagePermission('Roles')) ||
        next.includes(pagePermission('Visual Widgets')))
    if (
      canConfigureWidgets &&
      !next.includes(ACTION_KEYS.dashboardConfigureWidgets)
    ) {
      next.push(ACTION_KEYS.dashboardConfigureWidgets)
    }
  }
  if (from < 3) {
    const hasOpsSetup =
      next.includes(pagePermission('Template Auto Assign')) ||
      next.includes(pagePermission('Visit templates'))
    if (hasOpsSetup && !next.includes(pagePermission('Job scheduler'))) {
      next.push(pagePermission('Job scheduler'))
    }
  }
  return next
}

export const withAdminLockedPages = (roleId: string, permissions: string[]) => {
  if (roleId !== ADMIN_ROLE_ID) {
    return permissions
  }
  const next = [...permissions]
  for (const page of ADMIN_LOCKED_PAGES) {
    const key = pagePermission(page)
    if (!next.includes(key)) {
      next.push(key)
    }
  }
  return next
}

const pages = (...names: string[]) => names.map(pagePermission)

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
            !page.startsWith('Finance solution') &&
            !page.startsWith('Visual ') &&
            page !== 'Property Reports' &&
            page !== 'Reports Settings' &&
            page !== 'Property Groups' &&
            page !== 'Movements' &&
            page !== 'Services & Subscriptions',
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
        'Bookings Plan',
        'Bookings settings',
        'Reviews',
        'Unassigned tasks',
        'Visit templates',
        'Template Auto Assign',
        'Job scheduler',
        'Cleaning Plan',
        'Cleaning Incidents',
        'Cleaning Billing',
        'Cleaning settings',
      ),
      ACTION_KEYS.cleaningCloseMonth,
      ACTION_KEYS.cleaningBillingPrices,
      ACTION_KEYS.dailyOpsCreate,
      ACTION_KEYS.inventoryCreate,
      ACTION_KEYS.inventoryEditItems,
      ACTION_KEYS.spotCheckCreate,
      ACTION_KEYS.purchasesCreate,
      ACTION_KEYS.visitMoreInfo,
      ACTION_KEYS.propertiesUpdateFromGuesty,
      ACTION_KEYS.createTasks,
      ACTION_KEYS.dashboardCardCleaning,
      ACTION_KEYS.dashboardCardOps,
      ACTION_KEYS.dashboardCardInventory,
      ACTION_KEYS.dashboardConfigureWidgets,
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
        'Bookings Plan',
        'Bookings settings',
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
      ACTION_KEYS.dashboardConfigureWidgets,
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
