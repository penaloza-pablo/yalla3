import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsPanel } from './SettingsPanel'
import {
  displayInventoryName,
  translatePage,
  translateSection,
  translateStatus,
} from './i18n/display'
import { Amplify } from 'aws-amplify'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { authFetch } from './lib/auth-fetch'
import outputs from '../amplify_outputs.json'
import type {
  ConversationMessage,
  ConversationMessageContent,
} from '@aws-amplify/ui-react-ai'
import { useAIConversation } from './client'
import {
  ReviewWorkflowPanel,
  type ReviewWorkflowPersistPayload,
} from './ReviewWorkflowPanel'
import { DailyOperationsView } from './operations/DailyOperationsView'
import { CleaningPlanView } from './cleaning/CleaningPlanView'
import { CleaningIncidentsView } from './cleaning/CleaningIncidentsView'
import { CleaningBillingView } from './cleaning/CleaningBillingView'
import { CleaningSettingsView } from './cleaning/CleaningSettingsView'
import { MaintenanceIncidentsView } from './maintenance/MaintenanceIncidentsView'
import { MaintenanceBillingView } from './maintenance/MaintenanceBillingView'
import { MaintenanceSettingsView } from './maintenance/MaintenanceSettingsView'
import { LogsPanel } from './LogsPanel'
import { SpotCheckPanel } from './SpotCheckPanel'
import { MobileBodyPortal } from './MobileBodyPortal'
import { ExportScopeModal } from './ExportScopeModal'
import { downloadFromResponse } from './lib/download'
import './App.css'

type ConsumptionRule = {
  amount: number
  unit: string
}

type ConsumptionRules = {
  apartment?: ConsumptionRule
  hostel?: ConsumptionRule
  room?: ConsumptionRule
}

type InventoryRow = {
  id: string
  name: string
  nameEs: string
  location: string
  status: string
  quantity: number
  category: string
  updated: string
  updatedRaw: string
  rebuyQty: number
  unitPrice: number
  tolerance: number
  consumptionRules: ConsumptionRules | null
}

type AlertRow = {
  id: string
  name: string
  description: string
  date: string
  status: string
  origin: string
  createdBy: string
  snoozeUntil?: string
}

type PurchaseRow = {
  id: string
  itemId: string
  itemName: string
  location: string
  vendor: string
  units: number
  totalPrice: number
  deliveryDate: string
  deliveryDateRaw: string
  purchaseDate: string
  purchaseDateRaw: string
  status: string
  direct: boolean
  propertyId: string
  cost: number
  billable: boolean
  markupApplied: boolean
  markup: number
  ivaMarkup: number
  priceExclIva: number
  iva: number
  note: string
}

type SubtractionRow = {
  id: string
  itemId: string
  itemName: string
  inventoryLocation: string
  propertyId: string
  location: string
  units: number
  cost: number
  billable: boolean
  markupApplied: boolean
  markup: number
  ivaMarkup: number
  priceExclIva: number
  iva: number
  totalPrice: number
  note: string
  date: string
  dateRaw: string
  status: string
}

type InventoryFormState = {
  id: string
  name: string
  nameEs: string
  categoryChoice: string
  categoryOther: string
  locationChoice: string
  locationOther: string
  quantity: string
  rebuyQty: string
  unitPrice: string
  tolerance: string
}

type PurchaseFormState = {
  id: string
  itemId: string
  itemName: string
  location: string
  vendor: string
  units: string
  totalPrice: string
  deliveryDate: string
  purchaseDate: string
  status: string
  direct: boolean
  propertyId: string
  cost: string
  billable: boolean
  markup: boolean
  note: string
}

type SubtractionFormState = {
  itemId: string
  itemName: string
  inventoryLocation: string
  propertyId: string
  location: string
  units: string
  cost: string
  billable: boolean
  markup: boolean
  note: string
}

type InventoryApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type AlertsApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type PurchasesApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type SubtractionsApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type PropertyRow = {
  id: string
  title: string
  nickname: string
  active: boolean
  type: string
  roomType: string
  accommodates: number
  bedrooms: number
  bathrooms: number
  city: string
  neighborhood: string
  /** False for metrics-only Dynamo stubs (ListingNickname without property fields). */
  isManaged?: boolean
}

type PropertiesApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type BookingsApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
  scannedCount?: number
  nextCursor?: string | null
  pageSize?: number
}

type ReviewsApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type ReviewSyncStateApiResponse = {
  item?: Record<string, unknown> | null
  lastSyncAt?: string | null
  updatedAt?: string | null
}

type BookingRow = {
  id: string
  guestName: string
  property: string
  checkInRaw: string
  checkIn: string
  checkOutRaw: string
  checkOut: string
  status: string
  source: string
}

type ReviewRow = {
  reviewId: string
  guestName: string
  listingNickname: string
  rating: number
  createdAtRaw: string
  createdAt: string
  categoryRatings: {
    accuracy: number
    checkIn: number
    cleanliness: number
    communication: number
    location: number
    value: number
  }
  guestPaidTotal: number
  guestPaidTotalWithoutCleaning: number
  guestPaidDay: number
  propertyGuestPaidDayAverage: number
  privateReview: string
  publicReview: string
  workflowStep: string
  workflowStepIndex: number
  removalStrategy: string
  compensation: number
  reviewDeleted: string
  lowRatingReason: string
  status: string
}

type ExternalPropertiesPayload = {
  totalReturned?: number
  includeInactive?: boolean
  includeUnlisted?: boolean
  properties?: Record<string, unknown>[]
}

type PropertyDiff = {
  id: string
  action: 'add' | 'remove' | 'update'
  row: PropertyRow
}

const navigation = [
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
      'Daily Operations',
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
    section: 'Tech',
    items: ['Logs'],
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

const coreItems = ['Chatbot', 'Alerts']
const pagesWithMobileSearch = new Set([
  'Inventory',
  'Purchases',
  'Subtractions',
  'Alerts',
  'Logs',
  'Cleaning Incidents',
  'Maintenance Incidents',
])
const MOBILE_TITLE_COLLAPSE_DISTANCE = 56
const OTHER_OPTION = '__other__'
const inventoryFieldMap = {
  id: ['id', 'ID'],
  name: ['Item name', 'item name', 'name'],
  nameEs: ['nameEs', 'Item name ES', 'item name es', 'name_es'],
  category: ['category', 'Category'],
  location: ['Location', 'location'],
  status: ['Status', 'status'],
  quantity: ['Quantity', 'quantity'],
  updated: ['Last Updated', 'Last updated', 'last updated', 'updatedAt'],
  rebuyQty: ['rebuyQty', 'rebuyqty', 'Rebuy Qty'],
  unitPrice: ['unitPrice', 'unitprice', 'Unit Price'],
  tolerance: ['Tolerance', 'tolerance'],
  consumptionRules: ['consumptionRules', 'Consumption Rules'],
}

const alertFieldMap = {
  id: ['id', 'ID'],
  name: ['Name ', 'Name', 'name'],
  description: ['Description', 'description'],
  date: ['Date', 'date'],
  status: ['Status', 'status'],
  origin: ['Origin', 'origin'],
  createdBy: ['Create by', 'Created by', 'createdBy'],
  snoozeUntil: ['SnoozeUntil', 'snoozeUntil'],
}

const purchaseFieldMap = {
  id: ['id', 'ID'],
  itemId: ['Item id', 'Item ID', 'itemId', 'item id'],
  itemName: ['Item name', 'Item Name', 'itemName', 'item name', 'name'],
  location: ['Location', 'location'],
  vendor: ['Vendor', 'vendor'],
  units: ['Units', 'units'],
  totalPrice: ['Total price', 'totalPrice', 'total price'],
  deliveryDate: ['Delivery date', 'deliveryDate', 'delivery date'],
  purchaseDate: ['Purchase date', 'purchaseDate', 'purchase date'],
  status: ['Status', 'status'],
  direct: ['Direct', 'direct'],
  propertyId: ['Property id', 'Property ID', 'propertyId', 'property id'],
  cost: ['Cost', 'cost', 'Price incl. IVA', 'priceInclIva'],
  billable: ['Billable', 'billable'],
  markupApplied: ['Markup applied', 'markupApplied', 'MarkupApplied'],
  markup: ['Markup', 'markup'],
  ivaMarkup: ['IVA Markup', 'ivaMarkup', 'Iva Markup'],
  priceExclIva: ['Price excl. IVA', 'priceExclIva', 'Price excl IVA'],
  iva: ['IVA', 'iva'],
  note: ['Note', 'note'],
}

const subtractionFieldMap = {
  id: ['id', 'ID'],
  itemId: ['Item id', 'Item ID', 'itemId', 'item id'],
  itemName: ['Item name', 'Item Name', 'itemName', 'item name', 'name'],
  inventoryLocation: [
    'Inventory location',
    'inventoryLocation',
    'inventory location',
  ],
  propertyId: ['Property id', 'Property ID', 'propertyId', 'property id'],
  location: ['Location', 'location'],
  units: ['Units', 'units'],
  cost: ['Cost', 'cost', 'Price incl. IVA', 'priceInclIva'],
  billable: ['Billable', 'billable'],
  markupApplied: ['Markup applied', 'markupApplied', 'MarkupApplied'],
  markup: ['Markup', 'markup'],
  ivaMarkup: ['IVA Markup', 'ivaMarkup', 'Iva Markup'],
  priceExclIva: ['Price excl. IVA', 'priceExclIva', 'Price excl IVA'],
  iva: ['IVA', 'iva'],
  totalPrice: ['Total Price', 'totalPrice', 'Total price'],
  note: ['Note', 'note'],
  date: ['Date', 'date', 'Substraction date', 'Subtraction date'],
  status: ['Status', 'status'],
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

/** Pricing breakdown from price incl. IVA and optional 12% markup. */
const computeSubtractionPricing = (
  costInclIva: number,
  markupApplied: boolean,
) => {
  const safeCost = Number.isFinite(costInclIva) ? Math.max(0, costInclIva) : 0
  const markup = markupApplied ? roundMoney(safeCost * 0.12) : 0
  const ivaMarkup = roundMoney(markup * 0.21)
  const totalPrice = roundMoney(safeCost + markup + ivaMarkup)
  const priceExclIva = roundMoney(totalPrice / 1.21)
  const iva = roundMoney(priceExclIva * 0.21)
  return { markup, ivaMarkup, priceExclIva, iva, totalPrice }
}

const propertyFieldMap = {
  id: ['id', 'ID', 'ListingID', 'listingId'],
  title: ['title', 'Title'],
  nickname: ['nickname', 'Nickname', 'ListingNickname', 'listingNickname'],
  active: ['active', 'Active'],
  type: ['type', 'Type'],
  roomType: ['roomType', 'Room Type', 'room type'],
  accommodates: ['accommodates', 'Accommodates'],
  bedrooms: ['bedrooms', 'Bedrooms'],
  bathrooms: ['bathrooms', 'Bathrooms'],
  city: ['city', 'City'],
  neighborhood: ['neighborhood', 'Neighborhood'],
}

const bookingFieldMap = {
  id: [
    'id',
    'ID',
    'bookingId',
    'BookingID',
    'reservationId',
    'ReservationID',
    'confirmationCode',
    'ConfirmationCode',
  ],
  guestName: [
    'guestName',
    'GuestName',
    'Guest Name',
    'guest',
    'Guest',
    'guestFullName',
    'primaryGuestName',
  ],
  property: [
    'property',
    'Property',
    'propertyName',
    'PropertyName',
    'listingName',
    'ListingName',
    'listingNickname',
    'ListingNickname',
    'unitName',
    'nickname',
  ],
  checkIn: [
    'checkIn',
    'checkin',
    'check_in',
    'CheckIn',
    'Check-in',
    'Check in',
    'checkInDate',
    'CheckInDate',
    'arrivalDate',
    'ArrivalDate',
  ],
  checkOut: [
    'checkOut',
    'checkout',
    'check_out',
    'CheckOut',
    'Check-out',
    'Check out',
    'checkOutDate',
    'CheckOutDate',
    'departureDate',
    'DepartureDate',
  ],
  status: ['status', 'Status', 'reservationStatus', 'bookingStatus'],
  source: ['source', 'Source', 'channel', 'Channel', 'pms', 'PMS'],
}

const reviewFieldMap = {
  reviewId: ['ReviewID', 'reviewId', 'id', 'ID'],
  guestName: ['GuestName', 'guestName', 'Guest', 'guest'],
  listingNickname: ['ListingNickname', 'listingNickname', 'listingNickname'],
  rating: ['Rating', 'rating'],
  createdAt: ['CreatedAt', 'createdAt', 'Created At', 'created at'],
  categoryAccuracy: ['category_ratings_accuracy'],
  categoryCheckIn: ['category_ratings_checkin'],
  categoryCleanliness: ['category_ratings_cleanliness'],
  categoryCommunication: ['category_ratings_communication'],
  categoryLocation: ['category_ratings_location'],
  categoryValue: ['category_ratings_value'],
  guestPaidTotal: ['GuestPaidTotal', 'guestPaidTotal'],
  guestPaidTotalWithoutCleaning: [
    'GuestPaidTotalWithoutCleaning',
    'guestPaidTotalWithoutCleaning',
  ],
  guestPaidDay: ['GuestPaidDay', 'guestPaidDay'],
  propertyGuestPaidDayAverage: [
    'PropertyGuestPaidDayAverage',
    'propertyGuestPaidDayAverage',
  ],
  privateReview: ['PrivateReview', 'privateReview'],
  publicReview: ['PublicReview', 'publicReview'],
  workflowStep: ['WorkflowStep', 'workflowStep'],
  workflowStepIndex: ['WorkflowStepIndex', 'workflowStepIndex'],
  removalStrategy: ['RemovalStrategy', 'removalStrategy'],
  compensation: ['Compensation', 'compensation'],
  reviewDeleted: ['ReviewDeleted', 'reviewDeleted'],
  lowRatingReason: ['LowRatingReason', 'lowRatingReason'],
  status: ['Status', 'status'],
}

const getItemValue = (
  item: Record<string, unknown>,
  keys: string[],
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      return item[key]
    }
  }
  return undefined
}

const unwrapAttributeValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>
  if ('S' in record && typeof record.S === 'string') {
    return record.S
  }
  if ('N' in record && typeof record.N === 'string') {
    const parsed = Number(record.N)
    return Number.isFinite(parsed) ? parsed : record.N
  }
  if ('BOOL' in record && typeof record.BOOL === 'boolean') {
    return record.BOOL
  }
  if ('M' in record && record.M && typeof record.M === 'object') {
    return unwrapDynamoItem(record.M as Record<string, unknown>)
  }
  if ('L' in record && Array.isArray(record.L)) {
    return record.L.map((entry) => unwrapAttributeValue(entry))
  }

  return value
}

const unwrapDynamoItem = (item: Record<string, unknown>) => {
  const result: Record<string, unknown> = {}
  Object.entries(item).forEach(([key, value]) => {
    result[key] = unwrapAttributeValue(value)
  })
  return result
}

const normalizeInventoryItem = (item: Record<string, unknown>) => {
  if (Object.values(item).some((value) => value && typeof value === 'object')) {
    return unwrapDynamoItem(item)
  }
  return item
}

const getStringValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return String(value)
}

const getNumberValue = (value: unknown) => {
  if (typeof value === 'number') {
    return value
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getBooleanValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') {
      return true
    }
    if (normalized === 'false' || normalized === '0') {
      return false
    }
  }
  return false
}

const hasExplicitBoolean = (value: unknown) => {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return true
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return (
      normalized === 'true' ||
      normalized === 'false' ||
      normalized === '1' ||
      normalized === '0'
    )
  }
  return false
}

const resolvePropertyActive = (item: Record<string, unknown>) => {
  const listedValue = getItemValue(item, ['listed', 'isListed', 'Listed'])
  const activeValue = getItemValue(item, propertyFieldMap.active)
  const flags: boolean[] = []
  if (hasExplicitBoolean(listedValue)) {
    flags.push(getBooleanValue(listedValue))
  }
  if (hasExplicitBoolean(activeValue)) {
    flags.push(getBooleanValue(activeValue))
  }
  if (flags.length === 0) {
    return true
  }
  return flags.every(Boolean)
}

const formatDateForStorage = (value: string) => {
  if (!value) {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${now.getFullYear()}`
  }

  const trimmed = value.trim()

  // Already stored as DD/MM/YYYY — keep as-is to avoid MM/DD reinterpretation.
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${day}/${month}/${year}`
  }

  // HTML date inputs use YYYY-MM-DD; parse components to avoid timezone shifts.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}/${month}/${year}`
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return trimmed
  }

  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${parsed.getFullYear()}`
}

const formatUpdatedDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return '—'
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return '—'
    }

    const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (slashMatch) {
      const [, day, month, year] = slashMatch
      const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        })
      }
    }

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      })
    }
  }

  return getStringValue(value) || '—'
}

const formatAlertDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return '—'
    }
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}:\d{2})?$/)
    if (match) {
      const [, day, month, year, time] = match
      const parsed = new Date(`${year}-${month}-${day}T${time ?? '00:00'}:00Z`)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      }
    }
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }
  return getStringValue(value) || '—'
}

const formatUnitPrice = (value: number) => {
  if (!Number.isFinite(value) || value === 0) {
    return '—'
  }
  return `€ ${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })}`
}

const formatSnoozeUntil = (dateValue: string) => {
  if (!dateValue) {
    return ''
  }
  const parsed = new Date(`${dateValue}T09:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return parsed.toISOString()
}

const formatDateForInput = (value: string) => {
  if (!value) {
    return ''
  }
  const trimmed = value.trim()
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${month}-${day}`
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return ''
}

const getPurchaseSortTime = (row: PurchaseRow) => {
  const primary = parseDateValue(row.purchaseDateRaw || row.purchaseDate)
  if (primary) {
    return primary.getTime()
  }
  const secondary = parseDateValue(row.deliveryDateRaw || row.deliveryDate)
  return secondary?.getTime() ?? 0
}

const getPurchaseUnitPrice = (row: PurchaseRow) => {
  if (!row.units || row.units <= 0) {
    return 0
  }
  return row.totalPrice / row.units
}

/** Most recent purchases for an inventory item (default last 3). */
const getRecentPurchasesForItem = (
  itemId: string,
  purchases: PurchaseRow[],
  limit = 3,
) =>
  purchases
    .filter((purchase) => !purchase.direct && purchase.itemId === itemId)
    .slice()
    .sort((a, b) => getPurchaseSortTime(b) - getPurchaseSortTime(a))
    .slice(0, limit)

const statusRank: Record<string, number> = {
  Skipped: 5,
  Reorder: 4,
  'Low Stock': 3,
  'Waiting Delivery': 2,
  OK: 1,
  'In Stock': 1,
}

const computeInventoryStatus = (quantity: number, rebuyQty: number) => {
  if (quantity <= rebuyQty) {
    return 'Reorder'
  }
  const okThreshold = Math.floor(rebuyQty * 1.25)
  if (quantity >= okThreshold) {
    return 'OK'
  }
  return 'Low Stock'
}

const PURCHASE_WAITING_INVOICE = 'Waiting invoice'
const isReceivedPurchaseStatus = (status: string) =>
  status === 'Confirmed' || status === PURCHASE_WAITING_INVOICE
const isPendingPurchaseStatus = (status: string) =>
  status === 'Waiting Delivery' || status === PURCHASE_WAITING_INVOICE

const WARNING_STATUSES = ['Reorder', 'Low Stock', 'Skipped'] as const

const applyConfirmedPurchaseToInventory = (
  rows: InventoryRow[],
  itemId: string,
  units: number,
  totalPrice: number,
  statusOverride?: string,
) =>
  rows.map((entry) => {
    if (entry.id !== itemId) {
      return entry
    }
    const nextQuantity = entry.quantity + units
    return {
      ...entry,
      quantity: nextQuantity,
      unitPrice: units > 0 ? totalPrice / units : entry.unitPrice,
      status:
        statusOverride ?? computeInventoryStatus(nextQuantity, entry.rebuyQty),
    }
  })

const markInventoryWaitingDelivery = (rows: InventoryRow[], itemId: string) =>
  rows.map((entry) =>
    entry.id === itemId ? { ...entry, status: 'Waiting Delivery' } : entry,
  )

const resolveChoice = (choice: string, other: string) =>
  choice === OTHER_OPTION ? other.trim() : choice.trim()

const getNextInventoryId = (rows: InventoryRow[]) => {
  const maxId = rows.reduce((currentMax, row) => {
    const match = row.id.match(/^INV-(\d+)$/i)
    if (!match) {
      return currentMax
    }
    const value = Number(match[1])
    return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax
  }, 0)
  const nextValue = String(maxId + 1).padStart(3, '0')
  return `INV-${nextValue}`
}

const getCurrentUserEmail = async () => {
  try {
    const attributes = await fetchUserAttributes()
    return attributes.email ?? attributes.preferred_username ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

const mapInventoryRow = (item: Record<string, unknown>): InventoryRow => ({
  id: getStringValue(getItemValue(item, inventoryFieldMap.id)) || '—',
  name: getStringValue(getItemValue(item, inventoryFieldMap.name)) || '—',
  nameEs: getStringValue(getItemValue(item, inventoryFieldMap.nameEs)),
  category: getStringValue(getItemValue(item, inventoryFieldMap.category)),
  location:
    getStringValue(getItemValue(item, inventoryFieldMap.location)) || '—',
  status:
    getStringValue(getItemValue(item, inventoryFieldMap.status)) || 'Unknown',
  quantity: getNumberValue(getItemValue(item, inventoryFieldMap.quantity)),
  updatedRaw:
    getStringValue(getItemValue(item, inventoryFieldMap.updated)) || '',
  updated: formatUpdatedDate(getItemValue(item, inventoryFieldMap.updated)),
  rebuyQty: getNumberValue(getItemValue(item, inventoryFieldMap.rebuyQty)),
  unitPrice: getNumberValue(getItemValue(item, inventoryFieldMap.unitPrice)),
  tolerance: getNumberValue(getItemValue(item, inventoryFieldMap.tolerance)),
  consumptionRules:
    (getItemValue(item, inventoryFieldMap.consumptionRules) as
      | ConsumptionRules
      | undefined) ?? null,
})

const mapAlertRow = (item: Record<string, unknown>): AlertRow => ({
  id: getStringValue(getItemValue(item, alertFieldMap.id)) || '—',
  name: getStringValue(getItemValue(item, alertFieldMap.name)) || '—',
  description:
    getStringValue(getItemValue(item, alertFieldMap.description)) || '—',
  date: formatAlertDate(getItemValue(item, alertFieldMap.date)),
  status: getStringValue(getItemValue(item, alertFieldMap.status)) || 'Pending',
  origin: getStringValue(getItemValue(item, alertFieldMap.origin)) || '—',
  createdBy:
    getStringValue(getItemValue(item, alertFieldMap.createdBy)) || '—',
  snoozeUntil: getStringValue(getItemValue(item, alertFieldMap.snoozeUntil)),
})

const mapPurchaseRow = (item: Record<string, unknown>): PurchaseRow => {
  const deliveryDateRaw = getStringValue(
    getItemValue(item, purchaseFieldMap.deliveryDate),
  )
  const purchaseDateRaw = getStringValue(
    getItemValue(item, purchaseFieldMap.purchaseDate),
  )
  const cost = getNumberValue(getItemValue(item, purchaseFieldMap.cost))
  const markupApplied = getBooleanValue(
    getItemValue(item, purchaseFieldMap.markupApplied),
  )
  const storedMarkup = getItemValue(item, purchaseFieldMap.markup)
  const storedIvaMarkup = getItemValue(item, purchaseFieldMap.ivaMarkup)
  const storedPriceExclIva = getItemValue(item, purchaseFieldMap.priceExclIva)
  const storedIva = getItemValue(item, purchaseFieldMap.iva)
  const computed = computeSubtractionPricing(cost, markupApplied)
  return {
    id: getStringValue(getItemValue(item, purchaseFieldMap.id)) || '—',
    itemId: getStringValue(getItemValue(item, purchaseFieldMap.itemId)) || '—',
    itemName:
      getStringValue(getItemValue(item, purchaseFieldMap.itemName)) || '—',
    location:
      getStringValue(getItemValue(item, purchaseFieldMap.location)) || '—',
    vendor: getStringValue(getItemValue(item, purchaseFieldMap.vendor)) || '—',
    units: getNumberValue(getItemValue(item, purchaseFieldMap.units)),
    totalPrice: getNumberValue(getItemValue(item, purchaseFieldMap.totalPrice)),
    deliveryDateRaw,
    deliveryDate: formatUpdatedDate(deliveryDateRaw),
    purchaseDateRaw,
    purchaseDate: formatUpdatedDate(purchaseDateRaw),
    status:
      getStringValue(getItemValue(item, purchaseFieldMap.status)) ||
      'To be confirmed',
    direct: getBooleanValue(getItemValue(item, purchaseFieldMap.direct)),
    propertyId:
      getStringValue(getItemValue(item, purchaseFieldMap.propertyId)) || '',
    cost,
    billable: getBooleanValue(getItemValue(item, purchaseFieldMap.billable)),
    markupApplied,
    markup:
      storedMarkup === undefined || storedMarkup === null
        ? computed.markup
        : getNumberValue(storedMarkup),
    ivaMarkup:
      storedIvaMarkup === undefined || storedIvaMarkup === null
        ? computed.ivaMarkup
        : getNumberValue(storedIvaMarkup),
    priceExclIva:
      storedPriceExclIva === undefined || storedPriceExclIva === null
        ? computed.priceExclIva
        : getNumberValue(storedPriceExclIva),
    iva:
      storedIva === undefined || storedIva === null
        ? computed.iva
        : getNumberValue(storedIva),
    note: getStringValue(getItemValue(item, purchaseFieldMap.note)),
  }
}

const mapSubtractionRow = (item: Record<string, unknown>): SubtractionRow => {
  const dateRaw = getStringValue(getItemValue(item, subtractionFieldMap.date))
  const cost = getNumberValue(getItemValue(item, subtractionFieldMap.cost))
  const markupApplied = getBooleanValue(
    getItemValue(item, subtractionFieldMap.markupApplied),
  )
  const storedMarkup = getItemValue(item, subtractionFieldMap.markup)
  const storedIvaMarkup = getItemValue(item, subtractionFieldMap.ivaMarkup)
  const storedPriceExclIva = getItemValue(item, subtractionFieldMap.priceExclIva)
  const storedIva = getItemValue(item, subtractionFieldMap.iva)
  const storedTotalPrice = getItemValue(item, subtractionFieldMap.totalPrice)
  const computed = computeSubtractionPricing(cost, markupApplied)

  return {
    id: getStringValue(getItemValue(item, subtractionFieldMap.id)) || '—',
    itemId: getStringValue(getItemValue(item, subtractionFieldMap.itemId)) || '—',
    itemName:
      getStringValue(getItemValue(item, subtractionFieldMap.itemName)) || '—',
    inventoryLocation:
      getStringValue(
        getItemValue(item, subtractionFieldMap.inventoryLocation),
      ) || '—',
    propertyId:
      getStringValue(getItemValue(item, subtractionFieldMap.propertyId)) || '—',
    location:
      getStringValue(getItemValue(item, subtractionFieldMap.location)) || '—',
    units: getNumberValue(getItemValue(item, subtractionFieldMap.units)),
    cost,
    billable: getBooleanValue(getItemValue(item, subtractionFieldMap.billable)),
    markupApplied,
    markup:
      storedMarkup === undefined || storedMarkup === null
        ? computed.markup
        : getNumberValue(storedMarkup),
    ivaMarkup:
      storedIvaMarkup === undefined || storedIvaMarkup === null
        ? computed.ivaMarkup
        : getNumberValue(storedIvaMarkup),
    priceExclIva:
      storedPriceExclIva === undefined || storedPriceExclIva === null
        ? computed.priceExclIva
        : getNumberValue(storedPriceExclIva),
    iva:
      storedIva === undefined || storedIva === null
        ? computed.iva
        : getNumberValue(storedIva),
    totalPrice:
      storedTotalPrice === undefined || storedTotalPrice === null
        ? computed.totalPrice
        : getNumberValue(storedTotalPrice),
    note: getStringValue(getItemValue(item, subtractionFieldMap.note)),
    dateRaw,
    date: formatUpdatedDate(dateRaw),
    status:
      getStringValue(getItemValue(item, subtractionFieldMap.status)) ||
      'Pending Billing',
  }
}

const mapPropertyRow = (item: Record<string, unknown>): PropertyRow => {
  const addressValue = getItemValue(item, ['address'])
  const address =
    addressValue && typeof addressValue === 'object'
      ? (addressValue as Record<string, unknown>)
      : null
  const cityValue = address?.city ?? getItemValue(item, propertyFieldMap.city)
  const neighborhoodValue =
    address?.neighborhood ?? getItemValue(item, propertyFieldMap.neighborhood)
  const hasManagedFields =
    getItemValue(item, ['nickname', 'Nickname']) !== undefined ||
    getItemValue(item, ['title', 'Title']) !== undefined ||
    getItemValue(item, ['active', 'Active']) !== undefined

  return {
    id: getStringValue(getItemValue(item, propertyFieldMap.id)) || '—',
    title: getStringValue(getItemValue(item, propertyFieldMap.title)) || '—',
    nickname:
      getStringValue(getItemValue(item, propertyFieldMap.nickname)) || '—',
    active: resolvePropertyActive(item),
    type: getStringValue(getItemValue(item, propertyFieldMap.type)) || '—',
    roomType: getStringValue(getItemValue(item, propertyFieldMap.roomType)) || '—',
    accommodates: getNumberValue(
      getItemValue(item, propertyFieldMap.accommodates),
    ),
    bedrooms: getNumberValue(getItemValue(item, propertyFieldMap.bedrooms)),
    bathrooms: getNumberValue(getItemValue(item, propertyFieldMap.bathrooms)),
    city: getStringValue(cityValue) || '—',
    neighborhood: getStringValue(neighborhoodValue) || '—',
    // Stubs created by bookings/reviews sync only have ListingNickname metrics.
    isManaged: hasManagedFields,
  }
}

/** Fully managed in Properties (not a metrics-only stub). */
const isManagedProperty = (row: PropertyRow) => row.isManaged === true

const parseDateValue = (value: string) => {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatLocalIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const defaultBookingsCheckInRange = () => {
  const today = new Date()
  return {
    checkInFrom: formatLocalIsoDate(today),
    checkInTo: formatLocalIsoDate(addLocalDays(today, 14)),
  }
}

const DEFAULT_BOOKING_STATUSES = ['confirmed']

const listsMatchBookingStatuses = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value) =>
    right.some((entry) => entry.toLowerCase() === value.toLowerCase()),
  )

const defaultBookingsFilters = () => ({
  statuses: [...DEFAULT_BOOKING_STATUSES],
  ...defaultBookingsCheckInRange(),
})

const getCalendarMonthRange = (monthOffset: number) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0)
  return {
    dateFrom: formatLocalIsoDate(start),
    dateTo: formatLocalIsoDate(end),
  }
}

const matchesTableSearch = (
  query: string,
  values: Array<string | number | boolean | null | undefined>,
) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return values.some((value) => {
    if (value === null || value === undefined) {
      return false
    }
    return String(value).toLowerCase().includes(normalized)
  })
}

const mapBookingRow = (item: Record<string, unknown>): BookingRow => {
  const checkInRaw = getStringValue(getItemValue(item, bookingFieldMap.checkIn))
  const checkOutRaw = getStringValue(getItemValue(item, bookingFieldMap.checkOut))

  return {
    id: getStringValue(getItemValue(item, bookingFieldMap.id)) || '—',
    guestName: getStringValue(getItemValue(item, bookingFieldMap.guestName)) || '—',
    property: getStringValue(getItemValue(item, bookingFieldMap.property)) || '—',
    checkInRaw,
    checkIn: formatUpdatedDate(checkInRaw),
    checkOutRaw,
    checkOut: formatUpdatedDate(checkOutRaw),
    status: getStringValue(getItemValue(item, bookingFieldMap.status)) || 'Unknown',
    source: getStringValue(getItemValue(item, bookingFieldMap.source)) || '—',
  }
}

const mapReviewRow = (item: Record<string, unknown>): ReviewRow => {
  const createdAtRaw = getStringValue(getItemValue(item, reviewFieldMap.createdAt))
  return {
    reviewId: getStringValue(getItemValue(item, reviewFieldMap.reviewId)) || '—',
    guestName: getStringValue(getItemValue(item, reviewFieldMap.guestName)) || '—',
    listingNickname:
      getStringValue(getItemValue(item, reviewFieldMap.listingNickname)) || '—',
    rating: getNumberValue(getItemValue(item, reviewFieldMap.rating)),
    createdAtRaw,
    createdAt: formatAlertDate(createdAtRaw),
    categoryRatings: {
      accuracy: getNumberValue(getItemValue(item, reviewFieldMap.categoryAccuracy)),
      checkIn: getNumberValue(getItemValue(item, reviewFieldMap.categoryCheckIn)),
      cleanliness: getNumberValue(
        getItemValue(item, reviewFieldMap.categoryCleanliness),
      ),
      communication: getNumberValue(
        getItemValue(item, reviewFieldMap.categoryCommunication),
      ),
      location: getNumberValue(getItemValue(item, reviewFieldMap.categoryLocation)),
      value: getNumberValue(getItemValue(item, reviewFieldMap.categoryValue)),
    },
    guestPaidTotal: getNumberValue(getItemValue(item, reviewFieldMap.guestPaidTotal)),
    guestPaidTotalWithoutCleaning: getNumberValue(
      getItemValue(item, reviewFieldMap.guestPaidTotalWithoutCleaning),
    ),
    guestPaidDay: getNumberValue(getItemValue(item, reviewFieldMap.guestPaidDay)),
    propertyGuestPaidDayAverage: getNumberValue(
      getItemValue(item, reviewFieldMap.propertyGuestPaidDayAverage),
    ),
    privateReview:
      getStringValue(getItemValue(item, reviewFieldMap.privateReview)) || '—',
    publicReview:
      getStringValue(getItemValue(item, reviewFieldMap.publicReview)) || '—',
    workflowStep: getStringValue(getItemValue(item, reviewFieldMap.workflowStep)) || '—',
    workflowStepIndex: getNumberValue(
      getItemValue(item, reviewFieldMap.workflowStepIndex),
    ),
    removalStrategy: getStringValue(
      getItemValue(item, reviewFieldMap.removalStrategy),
    ),
    compensation: getNumberValue(getItemValue(item, reviewFieldMap.compensation)),
    reviewDeleted: getStringValue(getItemValue(item, reviewFieldMap.reviewDeleted)),
    lowRatingReason: getStringValue(
      getItemValue(item, reviewFieldMap.lowRatingReason),
    ),
    status: getStringValue(getItemValue(item, reviewFieldMap.status)) || '—',
  }
}

const mergeWorkflowPayloadIntoReviewRow = (
  row: ReviewRow,
  payload: ReviewWorkflowPersistPayload,
): ReviewRow => {
  const next = { ...row }
  if (payload.Status !== undefined) {
    next.status = payload.Status
  }
  if (payload.WorkflowStep !== undefined) {
    next.workflowStep = payload.WorkflowStep
  }
  if (payload.WorkflowStepIndex !== undefined) {
    next.workflowStepIndex = payload.WorkflowStepIndex
  }
  if (payload.RemovalStrategy !== undefined) {
    next.removalStrategy = payload.RemovalStrategy
  }
  if (payload.Compensation !== undefined) {
    next.compensation = payload.Compensation
  }
  if (payload.ReviewDeleted !== undefined) {
    next.reviewDeleted = payload.ReviewDeleted
  }
  if (payload.LowRatingReason !== undefined) {
    next.lowRatingReason = payload.LowRatingReason
  }
  return next
}

const parseExternalPropertiesResponse = async (response: Response) => {
  const payload = (await response.json()) as
    | ExternalPropertiesPayload
    | { body?: string }
    | undefined
  const bodyValue =
    payload && typeof payload === 'object' && 'body' in payload
      ? payload.body
      : null
  if (typeof bodyValue === 'string') {
    try {
      return JSON.parse(bodyValue) as ExternalPropertiesPayload
    } catch {
      return { properties: [] }
    }
  }
  return (payload as ExternalPropertiesPayload) ?? { properties: [] }
}

const getStatusClassName = (status: string) => {
  if (status === 'Low Stock') {
    return 'status status-warning'
  }
  if (status === 'Reorder') {
    return 'status status-danger'
  }
  if (status === 'In Stock') {
    return 'status status-success'
  }
  if (status === 'Waiting Delivery') {
    return 'status status-info'
  }
  if (status === 'Waiting invoice') {
    return 'status status-warning'
  }
  if (status === 'Skipped') {
    return 'status status-warning'
  }
  if (status === 'To be confirmed') {
    return 'status status-warning'
  }
  if (status === 'Confirmed') {
    return 'status status-success'
  }
  if (status === 'Pending Billing') {
    return 'status status-warning'
  }
  if (status === 'Billed') {
    return 'status status-success'
  }
  if (status === 'Not Billable') {
    return 'status status-neutral'
  }
  if (status === 'Reversed') {
    return 'status status-danger'
  }
  if (status === 'Pending') {
    return 'status status-warning'
  }
  if (status === 'Snoozed') {
    return 'status status-neutral'
  }
  if (status === 'Done') {
    return 'status status-success'
  }
  return 'status status-neutral'
}

const emptyFormState: InventoryFormState = {
  id: '',
  name: '',
  nameEs: '',
  categoryChoice: '',
  categoryOther: '',
  locationChoice: '',
  locationOther: '',
  quantity: '',
  rebuyQty: '',
  unitPrice: '',
  tolerance: '',
}

const emptyPurchaseFormState: PurchaseFormState = {
  id: '',
  itemId: '',
  itemName: '',
  location: '',
  vendor: '',
  units: '',
  totalPrice: '',
  deliveryDate: '',
  purchaseDate: '',
  status: '',
  direct: false,
  propertyId: '',
  cost: '',
  billable: true,
  markup: false,
  note: '',
}

const emptySubtractionFormState: SubtractionFormState = {
  itemId: '',
  itemName: '',
  inventoryLocation: '',
  propertyId: '',
  location: '',
  units: '1',
  cost: '',
  billable: true,
  markup: false,
  note: '',
}

function App() {
  const { t, i18n } = useTranslation()
  const pageLabel = (page: string) => translatePage(t, page)
  const navItemLabel = (page: string) =>
    t(`navPages.${page}`, { defaultValue: translatePage(t, page) })
  const sectionLabel = (section: string) => translateSection(t, section)
  const statusLabel = (status: string) => translateStatus(t, status)
  const itemDisplayName = (row: Pick<InventoryRow, 'name' | 'nameEs'>) =>
    displayInventoryName(i18n.language, row.name, row.nameEs)

  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isInventoryExportOpen, setIsInventoryExportOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alertRows, setAlertRows] = useState<AlertRow[]>([])
  const [isAlertsLoading, setIsAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [alertsLastUpdated, setAlertsLastUpdated] = useState<string | null>(null)
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set())
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([])
  const [isPurchasesLoading, setIsPurchasesLoading] = useState(false)
  const [purchasesError, setPurchasesError] = useState<string | null>(null)
  const [isPurchasesFilterOpen, setIsPurchasesFilterOpen] = useState(false)
  const [purchasesFilters, setPurchasesFilters] = useState<{
    locations: string[]
    statuses: string[]
    deliveryDateFrom: string
    deliveryDateTo: string
  }>({
    locations: [],
    statuses: ['To be confirmed', 'Waiting Delivery', 'Waiting invoice'],
    deliveryDateFrom: '',
    deliveryDateTo: '',
  })
  const [purchasesFilterDraft, setPurchasesFilterDraft] = useState<{
    locations: string[]
    statuses: string[]
    deliveryDateFrom: string
    deliveryDateTo: string
  }>({
    locations: [],
    statuses: ['To be confirmed', 'Waiting Delivery', 'Waiting invoice'],
    deliveryDateFrom: '',
    deliveryDateTo: '',
  })
  const [subtractionRows, setSubtractionRows] = useState<SubtractionRow[]>([])
  const [isSubtractionsLoading, setIsSubtractionsLoading] = useState(false)
  const [isSubtractionsExporting, setIsSubtractionsExporting] = useState(false)
  const [isSubtractionsExportOpen, setIsSubtractionsExportOpen] = useState(false)
  const [subtractionsError, setSubtractionsError] = useState<string | null>(null)
  const [isSubtractionsFilterOpen, setIsSubtractionsFilterOpen] = useState(false)
  const [subtractionsFilters, setSubtractionsFilters] = useState<{
    locations: string[]
    statuses: string[]
    dateFrom: string
    dateTo: string
  }>({
    locations: [],
    statuses: ['Pending Billing'],
    dateFrom: '',
    dateTo: '',
  })
  const [subtractionsFilterDraft, setSubtractionsFilterDraft] = useState<{
    locations: string[]
    statuses: string[]
    dateFrom: string
    dateTo: string
  }>({
    locations: [],
    statuses: ['Pending Billing'],
    dateFrom: '',
    dateTo: '',
  })
  const [subtractionsLastUpdated, setSubtractionsLastUpdated] = useState<
    string | null
  >(null)
  const [expandedSubtractionIds, setExpandedSubtractionIds] = useState<
    Set<string>
  >(new Set())
  const [propertyRows, setPropertyRows] = useState<PropertyRow[]>([])
  const [isPropertiesLoading, setIsPropertiesLoading] = useState(false)
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  const [propertiesLastUpdated, setPropertiesLastUpdated] = useState<
    string | null
  >(null)
  const [propertyDiffs, setPropertyDiffs] = useState<PropertyDiff[]>([])
  const [selectedPropertyDiffIds, setSelectedPropertyDiffIds] = useState<
    Set<string>
  >(new Set())
  const [isPropertiesDiffOpen, setIsPropertiesDiffOpen] = useState(false)
  const [propertiesSyncMessage, setPropertiesSyncMessage] = useState<
    string | null
  >(null)
  const [isApplyingPropertyChanges, setIsApplyingPropertyChanges] = useState(false)
  const [isPropertiesFilterOpen, setIsPropertiesFilterOpen] = useState(false)
  const [propertiesFilters, setPropertiesFilters] = useState<{
    statuses: string[]
    types: string[]
    roomTypes: string[]
    neighborhoods: string[]
  }>({
    statuses: [],
    types: [],
    roomTypes: [],
    neighborhoods: [],
  })
  const [propertiesFilterDraft, setPropertiesFilterDraft] = useState<{
    statuses: string[]
    types: string[]
    roomTypes: string[]
    neighborhoods: string[]
  }>({
    statuses: [],
    types: [],
    roomTypes: [],
    neighborhoods: [],
  })
  const [propertiesSortDirection, setPropertiesSortDirection] = useState<
    'asc' | 'desc'
  >('asc')
  const [bookingRows, setBookingRows] = useState<BookingRow[]>([])
  const [isBookingsLoading, setIsBookingsLoading] = useState(false)
  const [isBookingsSyncing, setIsBookingsSyncing] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [bookingsLastUpdated, setBookingsLastUpdated] = useState<string | null>(null)
  const [isBookingsFilterOpen, setIsBookingsFilterOpen] = useState(false)
  const [bookingsFilters, setBookingsFilters] = useState<{
    statuses: string[]
    checkInFrom: string
    checkInTo: string
  }>(defaultBookingsFilters)
  const [bookingsFilterDraft, setBookingsFilterDraft] = useState<{
    statuses: string[]
    checkInFrom: string
    checkInTo: string
  }>(defaultBookingsFilters)
  const [bookingsSortDirection, setBookingsSortDirection] = useState<'asc' | 'desc'>(
    'asc',
  )
  const [bookingsPageSize, setBookingsPageSize] = useState(50)
  const [bookingsCurrentCursor, setBookingsCurrentCursor] = useState<string | null>(
    null,
  )
  const [bookingsCursorHistory, setBookingsCursorHistory] = useState<
    Array<string | null>
  >([])
  const [bookingsNextCursor, setBookingsNextCursor] = useState<string | null>(null)
  const [bookingsAvailableStatuses, setBookingsAvailableStatuses] = useState<
    string[]
  >([...DEFAULT_BOOKING_STATUSES])
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [isReviewsSyncing, setIsReviewsSyncing] = useState(false)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [reviewsLastSyncAt, setReviewsLastSyncAt] = useState<string | null>(null)
  const [reviewWorkflowSavingId, setReviewWorkflowSavingId] = useState<
    string | null
  >(null)
  const [isReviewsFilterOpen, setIsReviewsFilterOpen] = useState(false)
  const [reviewsFilters, setReviewsFilters] = useState<{
    minRating: string
    maxRating: string
    createdFrom: string
    createdTo: string
    listingNickname: string
  }>({
    minRating: '',
    maxRating: '',
    createdFrom: '',
    createdTo: '',
    listingNickname: '',
  })
  const [reviewsFilterDraft, setReviewsFilterDraft] = useState<{
    minRating: string
    maxRating: string
    createdFrom: string
    createdTo: string
    listingNickname: string
  }>({
    minRating: '',
    maxRating: '',
    createdFrom: '',
    createdTo: '',
    listingNickname: '',
  })
  const [reviewsCreatedPreset, setReviewsCreatedPreset] = useState<
    'none' | 'last7' | 'last30'
  >('none')
  const [reviewsSortDirection, setReviewsSortDirection] = useState<'asc' | 'desc'>(
    'desc',
  )
  const [expandedReviewIds, setExpandedReviewIds] = useState<Set<string>>(new Set())
  const [purchasesLastUpdated, setPurchasesLastUpdated] = useState<
    string | null
  >(null)
  const [expandedPurchaseIds, setExpandedPurchaseIds] = useState<Set<string>>(
    new Set(),
  )
  const [isAlertsFilterOpen, setIsAlertsFilterOpen] = useState(false)
  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false)
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null)
  const [snoozeDate, setSnoozeDate] = useState('')
  const [snoozeError, setSnoozeError] = useState<string | null>(null)
  const [alertsFilters, setAlertsFilters] = useState<{
    statuses: string[]
    origins: string[]
  }>({
    statuses: ['Pending'],
    origins: [],
  })
  const [alertsFilterDraft, setAlertsFilterDraft] = useState<{
    statuses: string[]
    origins: string[]
  }>({
    statuses: ['Pending'],
    origins: [],
  })
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formStep, setFormStep] = useState<'details' | 'restock'>('details')
  const [formValues, setFormValues] = useState<InventoryFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPurchaseFormOpen, setIsPurchaseFormOpen] = useState(false)
  const [purchaseFormValues, setPurchaseFormValues] =
    useState<PurchaseFormState>(emptyPurchaseFormState)
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null)
  const [isPurchaseSaving, setIsPurchaseSaving] = useState(false)
  const [isSubtractionFormOpen, setIsSubtractionFormOpen] = useState(false)
  const [subtractionFormValues, setSubtractionFormValues] =
    useState<SubtractionFormState>(emptySubtractionFormState)
  const [subtractionFormError, setSubtractionFormError] = useState<string | null>(
    null,
  )
  const [isSubtractionSaving, setIsSubtractionSaving] = useState(false)
  const [activePage, setActivePage] = useState('Inventory')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isSummaryInfoOpen, setIsSummaryInfoOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [titleProgress, setTitleProgress] = useState(0)
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(navigation.map((group) => group.section)),
  )
  const [sortConfig, setSortConfig] = useState<{
    key: 'name' | 'status' | null
    direction: 'asc' | 'desc'
  }>({ key: null, direction: 'asc' })
  const [purchasesSortConfig, setPurchasesSortConfig] = useState<{
    key: 'date' | null
    direction: 'asc' | 'desc'
  }>({ key: 'date', direction: 'desc' })
  const [subtractionsSortConfig, setSubtractionsSortConfig] = useState<{
    key: 'date' | null
    direction: 'asc' | 'desc'
  }>({ key: 'date', direction: 'desc' })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<{
    locations: string[]
    statuses: string[]
    categories: string[]
  }>({
    locations: [],
    statuses: [],
    categories: [],
  })
  const [filterDraft, setFilterDraft] = useState<{
    locations: string[]
    statuses: string[]
    categories: string[]
  }>({
    locations: [],
    statuses: [],
    categories: [],
  })
  const conversationName =
    import.meta.env.VITE_CHATBOT_NAME?.trim() || 'chatbot'

  const formatChatContent = (content: ConversationMessageContent[]) =>
    content
      .map((part) => {
        if ('text' in part && typeof part.text === 'string') {
          return part.text
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')

  const ChatbotView = () => {
    const [chatInput, setChatInput] = useState('')
    const [chatError, setChatError] = useState<string | null>(null)
    const [debugOpen, setDebugOpen] = useState(false)
    const [debugInfo, setDebugInfo] = useState<{
      outputsStatus: string
      outputsKeys: string[]
      outputsHasData: boolean
      outputsHasAuth: boolean
      configKeys: string[]
      configHasData: boolean
      configHasAuth: boolean
    }>({
      outputsStatus: 'Not checked',
      outputsKeys: [],
      outputsHasData: false,
      outputsHasAuth: false,
      configKeys: [],
      configHasData: false,
      configHasAuth: false,
    })
    const [{ data: chatData, isLoading: isChatLoading }, handleSendMessage] =
      useAIConversation(conversationName)
    const chatMessages = (chatData?.messages ?? []) as ConversationMessage[]
    const isAiConfigured = debugInfo.configHasData || debugInfo.outputsHasData
    const quickPrompts = [
      'Show low stock items and locations.',
      'Summarize pending alerts from the last 7 days.',
      'Which items need reorder this week?',
    ]

    const sendMessage = async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) {
        return
      }
      setChatError(null)
      try {
        await Promise.resolve(handleSendMessage({ content: [{ text: trimmed }] }))
        setChatInput('')
      } catch {
        setChatError('Unable to send message. Please try again.')
      }
    }

    useEffect(() => {
      const config = Amplify.getConfig() as Record<string, unknown> & {
        API?: { GraphQL?: unknown }
      }
      const hasData =
        Boolean((config as { data?: unknown }).data) ||
        Boolean(config.API?.GraphQL)
      const hasAuth = Boolean(
        (config as { Auth?: { Cognito?: unknown } }).Auth?.Cognito,
      )

      setDebugInfo((current) => ({
        ...current,
        configKeys: Object.keys(config ?? {}),
        configHasData: hasData,
        configHasAuth: hasAuth,
      }))

      const checkOutputs = async () => {
        if (!import.meta.env.DEV) {
          setDebugInfo((current) => ({
            ...current,
            outputsStatus: 'Not checked (production)',
          }))
          return
        }

        try {
          const response = await authFetch('/amplify_outputs.json', {
            cache: 'no-store',
          })
          if (!response.ok) {
            setDebugInfo((current) => ({
              ...current,
              outputsStatus: `HTTP ${response.status}`,
            }))
            return
          }
          const outputs = (await response.json()) as Record<string, unknown>
          setDebugInfo((current) => ({
            ...current,
            outputsStatus: 'Loaded',
            outputsKeys: Object.keys(outputs ?? {}),
            outputsHasData: Boolean((outputs as { data?: unknown }).data),
            outputsHasAuth: Boolean(
              (outputs as { Auth?: { Cognito?: unknown } }).Auth?.Cognito,
            ),
          }))
        } catch {
          setDebugInfo((current) => ({
            ...current,
            outputsStatus: 'Fetch failed',
          }))
        }
      }

      void checkOutputs()
    }, [])

    return (
      <section className="card">
        <h1 className="page-title">{t('chatbot.title')}</h1>
        <p className="subtitle">{t('chatbot.subtitle')}</p>
        <div className="chat-layout">
          <div className="chat-panel">
            {!isAiConfigured ? (
              <div className="alert">
                Amplify AI is not configured yet. Verify that
                amplify_outputs.json includes data outputs.
              </div>
            ) : null}
            <div className="chat-window">
              {chatMessages.length ? (
                chatMessages.map((message) => (
                  <div
                    className={`chat-message ${
                      message.role === 'user' ? 'is-user' : 'is-assistant'
                    }`}
                    key={message.id}
                  >
                    <p className="chat-role">
                      {message.role === 'user' ? t('chatbot.you') : t('chatbot.assistant')}
                    </p>
                    <p className="chat-content">
                      {formatChatContent(message.content)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="chat-empty">{t('chatbot.empty')}</p>
              )}
            </div>
            <div className="chat-input-row">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage(chatInput)
                  }
                }}
                placeholder={t('chatbot.placeholder')}
                className="chat-input"
                rows={2}
              />
              <div className="chat-actions">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void sendMessage(chatInput)}
                  disabled={isChatLoading || !chatInput.trim()}
                >
                  {isChatLoading ? t('chatbot.sending') : t('chatbot.send')}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setDebugOpen((current) => !current)}
                >
                  {debugOpen ? 'Hide debug' : 'Show debug'}
                </button>
              </div>
            </div>
            {chatError ? <div className="alert">{chatError}</div> : null}
            {debugOpen ? <ChatbotDebugPanel debugInfo={debugInfo} /> : null}
          </div>
          <div className="chat-side">
            <div className="card card-compact">
              <p className="card-label">Amplify AI</p>
              <p className="card-value">
                {isAiConfigured ? 'Connected' : 'Not configured'}
              </p>
              <p className="card-meta">
                Conversation: {conversationName || 'chatbot'}
              </p>
            </div>
            <div className="card">
              <h2 className="card-title">{t('chatbot.quickPrompts')}</h2>
              <p className="card-subtitle">{t('chatbot.quickPromptsSubtitle')}</p>
              <div className="quick-prompts">
                {quickPrompts.map((prompt) => (
                  <button
                    className="btn-secondary btn-prompt"
                    type="button"
                    key={prompt}
                    onClick={() => void sendMessage(prompt)}
                    disabled={isChatLoading}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const ChatbotDebugPanel = ({
    debugInfo,
  }: {
    debugInfo: {
      outputsStatus: string
      outputsKeys: string[]
      outputsHasData: boolean
      outputsHasAuth: boolean
      configKeys: string[]
      configHasData: boolean
      configHasAuth: boolean
    }
  }) => (
    <div className="chat-debug">
      <p className="detail-label">Amplify config</p>
      <p className="detail-value">
        Keys: {debugInfo.configKeys.join(', ') || 'None'}
      </p>
      <p className="detail-value">
        Auth configured: {debugInfo.configHasAuth ? 'Yes' : 'No'}
      </p>
      <p className="detail-value">
        AI configured: {debugInfo.configHasData ? 'Yes' : 'No'}
      </p>

      <p className="detail-label">amplify_outputs.json</p>
      <p className="detail-value">Status: {debugInfo.outputsStatus}</p>
      <p className="detail-value">
        Keys: {debugInfo.outputsKeys.join(', ') || 'None'}
      </p>
      <p className="detail-value">
        Auth configured: {debugInfo.outputsHasAuth ? 'Yes' : 'No'}
      </p>
      <p className="detail-value">
        AI configured: {debugInfo.outputsHasData ? 'Yes' : 'No'}
      </p>
    </div>
  )

  const pendingAlertsCount = useMemo(
    () => alertRows.filter((row) => row.status === 'Pending').length,
    [alertRows],
  )

  const purchaseStatusOptions = [
    'To be confirmed',
    'Waiting Delivery',
    'Waiting invoice',
    'Confirmed',
  ]

  const purchaseLocationOptions = useMemo(() => {
    const unique = new Set(
      purchaseRows.map((row) => row.location).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [purchaseRows])

  const purchasesFilteredRows = useMemo(() => {
    const fromDate = purchasesFilters.deliveryDateFrom
      ? parseDateValue(purchasesFilters.deliveryDateFrom)
      : null
    const toDate = purchasesFilters.deliveryDateTo
      ? parseDateValue(purchasesFilters.deliveryDateTo)
      : null

    return purchaseRows
      .filter((row) => {
        const locationMatch =
          purchasesFilters.locations.length === 0 ||
          purchasesFilters.locations.includes(row.location)
        const statusMatch =
          purchasesFilters.statuses.length === 0 ||
          purchasesFilters.statuses.includes(row.status)

        if (!locationMatch || !statusMatch) {
          return false
        }

        if (
          !matchesTableSearch(tableSearchQuery, [
            row.id,
            row.itemId,
            row.itemName,
            row.location,
            row.vendor,
            row.status,
            row.units,
            row.totalPrice,
            row.deliveryDate,
            row.purchaseDate,
            row.note,
            row.direct ? 'direct directa' : '',
          ])
        ) {
          return false
        }

        if (!fromDate && !toDate) {
          return true
        }

        const deliveryDate = parseDateValue(row.deliveryDateRaw)
        if (!deliveryDate) {
          return false
        }

        if (fromDate && deliveryDate.getTime() < fromDate.getTime()) {
          return false
        }
        if (toDate && deliveryDate.getTime() > toDate.getTime()) {
          return false
        }
        return true
      })
  }, [
    purchaseRows,
    purchasesFilters.deliveryDateFrom,
    purchasesFilters.deliveryDateTo,
    purchasesFilters.locations,
    purchasesFilters.statuses,
    tableSearchQuery,
  ])

  const pendingPurchasesCount = useMemo(
    () => purchaseRows.filter((row) => isPendingPurchaseStatus(row.status)).length,
    [purchaseRows],
  )

  const purchasesActiveFilterCount = useMemo(() => {
    return (
      purchasesFilters.locations.length +
      purchasesFilters.statuses.length +
      (purchasesFilters.deliveryDateFrom ? 1 : 0) +
      (purchasesFilters.deliveryDateTo ? 1 : 0)
    )
  }, [
    purchasesFilters.deliveryDateFrom,
    purchasesFilters.deliveryDateTo,
    purchasesFilters.locations.length,
    purchasesFilters.statuses.length,
  ])

  const isWaitingQuickFilterActive = useMemo(
    () =>
      purchasesFilters.statuses.length === 1 &&
      purchasesFilters.statuses[0] === 'Waiting Delivery',
    [purchasesFilters.statuses],
  )

  const toggleWaitingQuickFilter = () => {
    if (isWaitingQuickFilterActive) {
      setPurchasesFilters((current) => ({ ...current, statuses: [] }))
      setPurchasesFilterDraft((current) => ({ ...current, statuses: [] }))
      return
    }
    setPurchasesFilters((current) => ({
      ...current,
      statuses: ['Waiting Delivery'],
    }))
    setPurchasesFilterDraft((current) => ({
      ...current,
      statuses: ['Waiting Delivery'],
    }))
  }

  const subtractionStatusOptions = [
    'Pending Billing',
    'Billed',
    'Not Billable',
    'Reversed',
  ]

  const subtractionLocationOptions = useMemo(() => {
    const unique = new Set(
      subtractionRows.map((row) => row.location).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [subtractionRows])

  const activePropertyOptions = useMemo(() => {
    return propertyRows
      .filter((row) => isManagedProperty(row) && row.active)
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
  }, [propertyRows])

  const activeManagedPropertyOptions = useMemo(
    () =>
      propertyRows
        .filter((row) => isManagedProperty(row) && row.active)
        .map((row) => ({
          id: row.id,
          nickname: row.nickname,
          title: row.title,
          listingNickname: row.nickname,
          type: row.type && row.type !== '—' ? row.type : undefined,
        })),
    [propertyRows],
  )

  const subtractionsFilteredRows = useMemo(() => {
    const fromDate = subtractionsFilters.dateFrom
      ? parseDateValue(subtractionsFilters.dateFrom)
      : null
    const toDate = subtractionsFilters.dateTo
      ? parseDateValue(subtractionsFilters.dateTo)
      : null

    return subtractionRows
      .filter((row) => {
        const locationMatch =
          subtractionsFilters.locations.length === 0 ||
          subtractionsFilters.locations.includes(row.location)
        const statusMatch =
          subtractionsFilters.statuses.length === 0 ||
          subtractionsFilters.statuses.includes(row.status)

        if (!locationMatch || !statusMatch) {
          return false
        }

        if (
          !matchesTableSearch(tableSearchQuery, [
            row.id,
            row.itemId,
            row.itemName,
            row.inventoryLocation,
            row.propertyId,
            row.location,
            row.status,
            row.units,
            row.cost,
            row.note,
            row.date,
            row.billable ? 'yes' : 'no',
          ])
        ) {
          return false
        }

        if (!fromDate && !toDate) {
          return true
        }

        const rowDate = parseDateValue(row.dateRaw)
        if (!rowDate) {
          return false
        }

        if (fromDate && rowDate.getTime() < fromDate.getTime()) {
          return false
        }
        if (toDate) {
          const endOfToDate = new Date(toDate)
          endOfToDate.setUTCHours(23, 59, 59, 999)
          if (rowDate.getTime() > endOfToDate.getTime()) {
            return false
          }
        }
        return true
      })
  }, [
    subtractionRows,
    subtractionsFilters.dateFrom,
    subtractionsFilters.dateTo,
    subtractionsFilters.locations,
    subtractionsFilters.statuses,
    tableSearchQuery,
  ])

  const pendingSubtractionsCount = useMemo(
    () =>
      subtractionsFilteredRows.filter((row) => row.status === 'Pending Billing')
        .length,
    [subtractionsFilteredRows],
  )

  const subtractionsActiveFilterCount = useMemo(() => {
    return (
      subtractionsFilters.locations.length +
      subtractionsFilters.statuses.length +
      (subtractionsFilters.dateFrom ? 1 : 0) +
      (subtractionsFilters.dateTo ? 1 : 0)
    )
  }, [
    subtractionsFilters.dateFrom,
    subtractionsFilters.dateTo,
    subtractionsFilters.locations.length,
    subtractionsFilters.statuses.length,
  ])

  const isPendingBillingQuickFilterActive = useMemo(
    () =>
      subtractionsFilters.statuses.length === 1 &&
      subtractionsFilters.statuses[0] === 'Pending Billing',
    [subtractionsFilters.statuses],
  )

  const togglePendingBillingQuickFilter = () => {
    if (isPendingBillingQuickFilterActive) {
      setSubtractionsFilters((current) => ({ ...current, statuses: [] }))
      setSubtractionsFilterDraft((current) => ({ ...current, statuses: [] }))
      return
    }
    setSubtractionsFilters((current) => ({
      ...current,
      statuses: ['Pending Billing'],
    }))
    setSubtractionsFilterDraft((current) => ({
      ...current,
      statuses: ['Pending Billing'],
    }))
  }

  const currentMonthRange = getCalendarMonthRange(0)
  const previousMonthRange = getCalendarMonthRange(-1)

  const isCurrentMonthQuickFilterActive =
    subtractionsFilters.dateFrom === currentMonthRange.dateFrom &&
    subtractionsFilters.dateTo === currentMonthRange.dateTo

  const isPreviousMonthQuickFilterActive =
    subtractionsFilters.dateFrom === previousMonthRange.dateFrom &&
    subtractionsFilters.dateTo === previousMonthRange.dateTo

  const applySubtractionsMonthRange = (range: {
    dateFrom: string
    dateTo: string
  } | null) => {
    setSubtractionsFilters((current) => ({
      ...current,
      dateFrom: range?.dateFrom ?? '',
      dateTo: range?.dateTo ?? '',
    }))
    setSubtractionsFilterDraft((current) => ({
      ...current,
      dateFrom: range?.dateFrom ?? '',
      dateTo: range?.dateTo ?? '',
    }))
  }

  const toggleCurrentMonthQuickFilter = () => {
    applySubtractionsMonthRange(
      isCurrentMonthQuickFilterActive ? null : getCalendarMonthRange(0),
    )
  }

  const togglePreviousMonthQuickFilter = () => {
    applySubtractionsMonthRange(
      isPreviousMonthQuickFilterActive ? null : getCalendarMonthRange(-1),
    )
  }

  const getEndpoint = (key: string, fallback?: string) => {
    const config = Amplify.getConfig() as { custom?: Record<string, string> }
    const outputCustom = (outputs as { custom?: Record<string, string> }).custom
    const fromAmplify = config.custom?.[key] ?? outputCustom?.[key]
    // Prefer amplify_outputs (synced from hosting/sandbox). Env URLs are only a
    // fallback so stale .env.local overrides cannot break local development.
    const preferEnv = import.meta.env.VITE_PREFER_ENV_ENDPOINTS === 'true'
    if (preferEnv && fallback) {
      return fallback
    }
    return fromAmplify ?? (fallback || undefined)
  }

  const fetchInventory = useCallback(async () => {
    const endpoint = getEndpoint(
      'getInventoryUrl',
      import.meta.env.VITE_GET_INVENTORY_URL,
    )
    if (!endpoint) {
      setError(
        'Missing inventory endpoint. Set VITE_GET_INVENTORY_URL in the environment.',
      )
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Inventory request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as InventoryApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapInventoryRow(normalizeInventoryItem(entry)),
      )
      setInventoryRows(mappedRows)
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load inventory data. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    const endpoint = getEndpoint(
      'getAlertsUrl',
      import.meta.env.VITE_GET_ALERTS_URL,
    )
    if (!endpoint) {
      setAlertsError(
        'Missing alerts endpoint. Set VITE_GET_ALERTS_URL in the environment.',
      )
      return
    }

    setIsAlertsLoading(true)
    setAlertsError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Alerts request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as AlertsApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapAlertRow(normalizeInventoryItem(entry)),
      )
      setAlertRows(mappedRows)
      setAlertsLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load alerts. Please try again.'
      setAlertsError(message)
    } finally {
      setIsAlertsLoading(false)
    }
  }, [])

  const fetchPurchases = useCallback(async () => {
    const endpoint = getEndpoint(
      'getPurchasesUrl',
      import.meta.env.VITE_GET_PURCHASES_URL,
    )
    if (!endpoint) {
      setPurchasesError(
        'Missing purchases endpoint. Set VITE_GET_PURCHASES_URL in the environment.',
      )
      return
    }

    setIsPurchasesLoading(true)
    setPurchasesError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Purchases request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as PurchasesApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapPurchaseRow(normalizeInventoryItem(entry)),
      )
      setPurchaseRows(mappedRows)
      setPurchasesLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load purchases. Please try again.'
      setPurchasesError(message)
    } finally {
      setIsPurchasesLoading(false)
    }
  }, [])

  const fetchSubtractions = useCallback(async () => {
    const endpoint = getEndpoint(
      'getSubtractionsUrl',
      import.meta.env.VITE_GET_SUBTRACTIONS_URL,
    )
    if (!endpoint) {
      setSubtractionsError(
        'Missing subtractions endpoint. Set VITE_GET_SUBTRACTIONS_URL in the environment.',
      )
      return
    }

    setIsSubtractionsLoading(true)
    setSubtractionsError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Subtractions request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as SubtractionsApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapSubtractionRow(normalizeInventoryItem(entry)),
      )
      setSubtractionRows(mappedRows)
      setSubtractionsLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load subtractions. Please try again.'
      setSubtractionsError(message)
    } finally {
      setIsSubtractionsLoading(false)
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    const endpoint = getEndpoint(
      'getPropertiesUrl',
      import.meta.env.VITE_GET_PROPERTIES_URL,
    )
    if (!endpoint) {
      setPropertiesError(
        'Missing properties endpoint. Set VITE_GET_PROPERTIES_URL in the environment.',
      )
      return
    }

    setIsPropertiesLoading(true)
    setPropertiesError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Properties request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as PropertiesApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapPropertyRow(normalizeInventoryItem(entry)),
      )
      setPropertyRows(mappedRows)
      setPropertiesLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load properties. Please try again.'
      setPropertiesError(message)
    } finally {
      setIsPropertiesLoading(false)
    }
  }, [])

  const fetchBookings = useCallback(
    async (cursor: string | null) => {
      const endpoint = getEndpoint(
        'getBookingsUrl',
        import.meta.env.VITE_GET_BOOKINGS_URL,
      )
      if (!endpoint) {
        setBookingsError(
          'Missing bookings endpoint. Set VITE_GET_BOOKINGS_URL in the environment.',
        )
        return
      }

      setIsBookingsLoading(true)
      setBookingsError(null)

      try {
        const query = new URLSearchParams()
        query.set('limit', String(bookingsPageSize))
        if (cursor) {
          query.set('cursor', cursor)
        }
        if (bookingsFilters.checkInFrom) {
          query.set('checkInFrom', bookingsFilters.checkInFrom)
        }
        if (bookingsFilters.checkInTo) {
          query.set('checkInTo', bookingsFilters.checkInTo)
        }

        const response = await authFetch(`${endpoint}?${query.toString()}`)
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Bookings request failed (${response.status}). ${errorText}`.trim(),
          )
        }

        const payload = (await response.json()) as BookingsApiResponse
        const items = Array.isArray(payload.items) ? payload.items : []
        const mappedRows = items.map((entry) =>
          mapBookingRow(normalizeInventoryItem(entry)),
        )
        const uniqueStatuses = Array.from(
          new Set(mappedRows.map((row) => row.status).filter(Boolean)),
        )
        setBookingsAvailableStatuses(uniqueStatuses)
        const filteredRows = mappedRows.filter((row) => {
          if (bookingsFilters.statuses.length === 0) {
            return true
          }
          return bookingsFilters.statuses.some(
            (status) => status.toLowerCase() === row.status.toLowerCase(),
          )
        })
        setBookingRows(filteredRows)
        setBookingsNextCursor(payload.nextCursor ?? null)
        setBookingsLastUpdated(
          new Date().toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        )
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load bookings. Please try again.'
        setBookingsError(message)
      } finally {
        setIsBookingsLoading(false)
      }
    },
    [bookingsFilters, bookingsPageSize],
  )

  const refreshBookingsFromGuesty = useCallback(async () => {
    setIsBookingsSyncing(true)
    setBookingsError(null)

    try {
      const endpoint = getEndpoint(
        'proxyGuestyBookingsSyncUrl',
        import.meta.env.VITE_PROXY_GUESTY_BOOKINGS_SYNC_URL,
      )
      if (!endpoint) {
        setBookingsError(
          t('bookings.missingSyncEndpoint'),
        )
        return
      }

      const range = defaultBookingsCheckInRange()
      const fromYmd = bookingsFilters.checkInFrom || range.checkInFrom
      const toYmd = bookingsFilters.checkInTo || range.checkInTo
      const query = new URLSearchParams()
      query.set('fromYmd', fromYmd)
      query.set('toYmd', toYmd)
      query.set('maxItems', '5000')

      const response = await authFetch(`${endpoint}?${query.toString()}`)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Bookings sync trigger failed (${response.status}). ${errorText}`.trim(),
        )
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 1500)
      })
      await fetchBookings(null)
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : t('bookings.syncError')
      setBookingsError(message)
    } finally {
      setIsBookingsSyncing(false)
    }
  }, [bookingsFilters.checkInFrom, bookingsFilters.checkInTo, fetchBookings, t])

  const fetchReviews = useCallback(async () => {
    const reviewsEndpoint = getEndpoint(
      'getReviewsUrl',
      import.meta.env.VITE_GET_REVIEWS_URL,
    )
    const syncStateEndpoint = getEndpoint(
      'getReviewsSyncStateUrl',
      import.meta.env.VITE_GET_REVIEWS_SYNC_STATE_URL,
    )
    if (!reviewsEndpoint) {
      setReviewsError(
        'Missing reviews endpoint. Set VITE_GET_REVIEWS_URL in the environment.',
      )
      return
    }
    if (!syncStateEndpoint) {
      setReviewsError(
        'Missing reviews sync endpoint. Set VITE_GET_REVIEWS_SYNC_STATE_URL in the environment.',
      )
      return
    }

    setIsReviewsLoading(true)
    setReviewsError(null)

    try {
      const [reviewsResponse, syncStateResponse] = await Promise.all([
        authFetch(reviewsEndpoint),
        authFetch(syncStateEndpoint),
      ])

      if (!reviewsResponse.ok) {
        const errorText = await reviewsResponse.text()
        throw new Error(
          `Reviews request failed (${reviewsResponse.status}). ${errorText}`.trim(),
        )
      }
      if (!syncStateResponse.ok) {
        const errorText = await syncStateResponse.text()
        throw new Error(
          `Reviews sync state request failed (${syncStateResponse.status}). ${errorText}`.trim(),
        )
      }

      const payload = (await reviewsResponse.json()) as ReviewsApiResponse
      const syncStatePayload =
        (await syncStateResponse.json()) as ReviewSyncStateApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapReviewRow(normalizeInventoryItem(entry)),
      )
      setReviewRows(mappedRows)
      setReviewsLastSyncAt(formatAlertDate(syncStatePayload.lastSyncAt ?? ''))
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load reviews. Please try again.'
      setReviewsError(message)
    } finally {
      setIsReviewsLoading(false)
    }
  }, [])

  const refreshReviews = useCallback(async () => {
    setIsReviewsSyncing(true)
    setReviewsError(null)

    try {
      // Call Amplify proxy (same-origin CORS) which invokes Guesty server-side.
      const endpoint = getEndpoint(
        'proxyGuestyReviewsSyncUrl',
        import.meta.env.VITE_PROXY_GUESTY_REVIEWS_SYNC_URL,
      )
      if (!endpoint) {
        setReviewsError(
          'Missing Guesty reviews sync proxy. Redeploy backend or set VITE_PROXY_GUESTY_REVIEWS_SYNC_URL.',
        )
        return
      }
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Reviews sync trigger failed (${response.status}). ${errorText}`.trim(),
        )
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 4000)
      })

      await fetchReviews()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to trigger reviews sync. Please try again.'
      setReviewsError(message)
    } finally {
      setIsReviewsSyncing(false)
    }
  }, [fetchReviews])

  const persistReviewWorkflow = useCallback(
    async (reviewId: string, payload: ReviewWorkflowPersistPayload) => {
      const endpoint = getEndpoint(
        'updateReviewWorkflowUrl',
        import.meta.env.VITE_UPDATE_REVIEW_WORKFLOW_URL,
      )
      if (!endpoint) {
        setReviewsError(
          'Missing update review workflow endpoint. Set VITE_UPDATE_REVIEW_WORKFLOW_URL.',
        )
        return
      }
      setReviewWorkflowSavingId(reviewId)
      setReviewsError(null)
      try {
        const response = await authFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewId, ...payload }),
        })
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Review workflow update failed (${response.status}). ${errorText}`.trim(),
          )
        }
        setReviewRows((rows) =>
          rows.map((r) =>
            r.reviewId === reviewId
              ? mergeWorkflowPayloadIntoReviewRow(r, payload)
              : r,
          ),
        )
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Unable to save workflow.'
        setReviewsError(message)
      } finally {
        setReviewWorkflowSavingId(null)
      }
    },
    [],
  )

  const refreshPropertiesDiff = useCallback(async () => {
    setIsPropertiesLoading(true)
    setPropertiesError(null)
    setPropertiesSyncMessage(null)

    try {
      // Call Amplify proxy (same-origin CORS) which invokes Guesty server-side.
      const endpoint = getEndpoint(
        'proxyGuestyListingsUrl',
        import.meta.env.VITE_PROXY_GUESTY_LISTINGS_URL,
      )
      if (!endpoint) {
        setPropertiesError(
          'Missing Guesty listings proxy. Redeploy backend or set VITE_PROXY_GUESTY_LISTINGS_URL.',
        )
        return
      }
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `External properties request failed (${response.status}). ${errorText}`.trim(),
        )
      }

      const externalPayload = await parseExternalPropertiesResponse(response)
      const externalItems = Array.isArray(externalPayload.properties)
        ? externalPayload.properties
        : []
      const externalRows = externalItems.map((item) =>
        mapPropertyRow(normalizeInventoryItem(item)),
      )

      // Only fully managed Dynamo rows count as "already in Yalla" for add/remove.
      // Metrics-only stubs (e.g. Jerte with ListingNickname but no nickname/active)
      // should still be suggested as add when Guesty reports them active.
      const managedById = new Map(
        propertyRows.filter(isManagedProperty).map((row) => [row.id, row]),
      )
      const externalById = new Map(externalRows.map((row) => [row.id, row]))
      const nextDiffs: PropertyDiff[] = []

      externalRows.forEach((row) => {
        if (row.active && !managedById.has(row.id)) {
          nextDiffs.push({
            id: `add:${row.id}`,
            action: 'add',
            row,
          })
        }
      })

      propertyRows.filter(isManagedProperty).forEach((row) => {
        const external = externalById.get(row.id)
        if (!external) {
          nextDiffs.push({
            id: `remove:${row.id}`,
            action: 'remove',
            row,
          })
          return
        }
        if (row.active && !external.active) {
          nextDiffs.push({
            id: `update:${row.id}`,
            action: 'update',
            row: {
              ...row,
              active: false,
            },
          })
        }
      })

      if (nextDiffs.length === 0) {
        setPropertyDiffs([])
        setSelectedPropertyDiffIds(new Set())
        setIsPropertiesDiffOpen(false)
        setPropertiesSyncMessage('No changes found against external source.')
        return
      }

      setPropertyDiffs(nextDiffs)
      setSelectedPropertyDiffIds(new Set())
      setIsPropertiesDiffOpen(true)
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to refresh properties. Please try again.'
      setPropertiesError(message)
    } finally {
      setIsPropertiesLoading(false)
    }
  }, [propertyRows])

  const applyPropertyDiffSelection = async () => {
    const upsertEndpoint = getEndpoint(
      'upsertPropertyUrl',
      import.meta.env.VITE_UPSERT_PROPERTY_URL,
    )
    const deleteEndpoint = getEndpoint(
      'deletePropertyUrl',
      import.meta.env.VITE_DELETE_PROPERTY_URL,
    )
    if (!upsertEndpoint || !deleteEndpoint) {
      setPropertiesError(
        'Missing properties write endpoints. Set VITE_UPSERT_PROPERTY_URL and VITE_DELETE_PROPERTY_URL in the environment.',
      )
      return
    }

    const selectedDiffs = propertyDiffs.filter((diff) =>
      selectedPropertyDiffIds.has(diff.id),
    )
    if (selectedDiffs.length === 0) {
      setPropertiesSyncMessage('No changes selected.')
      setIsPropertiesDiffOpen(false)
      return
    }

    setIsApplyingPropertyChanges(true)
    setPropertiesError(null)

    try {
      for (const diff of selectedDiffs) {
        if (diff.action === 'add' || diff.action === 'update') {
          const payload = {
            id: diff.row.id,
            title: diff.row.title,
            nickname: diff.row.nickname,
            active: diff.row.active,
            type: diff.row.type,
            roomType: diff.row.roomType,
            accommodates: diff.row.accommodates,
            bedrooms: diff.row.bedrooms,
            bathrooms: diff.row.bathrooms,
            city: diff.row.city,
            neighborhood: diff.row.neighborhood,
          }
          const response = await authFetch(upsertEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
              `Failed to ${diff.action === 'update' ? 'update' : 'add'} property ${diff.row.id} (${response.status}). ${errorText}`.trim(),
            )
          }
          continue
        }

        const response = await authFetch(deleteEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: diff.row.id }),
        })
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Failed to delete property ${diff.row.id} (${response.status}). ${errorText}`.trim(),
          )
        }
      }

      setIsPropertiesDiffOpen(false)
      setPropertyDiffs([])
      setSelectedPropertyDiffIds(new Set())
      setPropertiesSyncMessage(
        `Applied ${selectedDiffs.length} selected change${selectedDiffs.length === 1 ? '' : 's'}.`,
      )
      await fetchProperties()
    } catch (applyError) {
      const message =
        applyError instanceof Error
          ? applyError.message
          : 'Unable to apply selected changes.'
      setPropertiesError(message)
    } finally {
      setIsApplyingPropertyChanges(false)
    }
  }

  const exportInventory = useCallback(async (ids?: string[]) => {
    const endpoint = getEndpoint(
      'exportInventoryUrl',
      import.meta.env.VITE_EXPORT_INVENTORY_URL,
    )
    if (!endpoint) {
      setError(
        'Missing export endpoint. Set VITE_EXPORT_INVENTORY_URL in the environment.',
      )
      return false
    }

    setIsExporting(true)
    setError(null)

    try {
      const response = await authFetch(
        endpoint,
        ids
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ids }),
            }
          : undefined,
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Export request failed (${response.status}). ${errorText}`.trim(),
        )
      }

      const fallbackStamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, '')
      await downloadFromResponse(
        response,
        `inventory-export-${fallbackStamp}.xlsx`,
      )
      return true
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to export inventory. Please try again.'
      setError(message)
      return false
    } finally {
      setIsExporting(false)
    }
  }, [])

  const exportSubtractions = useCallback(async (ids?: string[]) => {
    const endpoint = getEndpoint(
      'exportSubtractionsUrl',
      import.meta.env.VITE_EXPORT_SUBTRACTIONS_URL,
    )
    if (!endpoint) {
      setSubtractionsError(t('subtractions.missingExport'))
      return false
    }

    setIsSubtractionsExporting(true)
    setSubtractionsError(null)

    try {
      const response = await authFetch(
        endpoint,
        ids
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ids }),
            }
          : undefined,
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Export request failed (${response.status}). ${errorText}`.trim(),
        )
      }

      const fallbackStamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, '')
      await downloadFromResponse(
        response,
        `subtractions-export-${fallbackStamp}.xlsx`,
      )
      return true
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : t('subtractions.exportError')
      setSubtractionsError(message)
      return false
    } finally {
      setIsSubtractionsExporting(false)
    }
  }, [t])

  const openSnoozeModal = (id: string) => {
    setSnoozeTargetId(id)
    setSnoozeDate('')
    setSnoozeError(null)
    setIsSnoozeOpen(true)
  }

  useEffect(() => {
    if (activePage === 'Inventory') {
      void fetchInventory()
      void fetchPurchases()
    }
    if (activePage === 'Alerts') {
      void fetchAlerts()
    }
    if (activePage === 'Purchases') {
      void fetchPurchases()
      void fetchProperties()
    }
    if (activePage === 'Subtractions') {
      void fetchSubtractions()
    }
    if (activePage === 'Properties') {
      void fetchProperties()
    }
    if (activePage === 'Bookings') {
      void fetchBookings(bookingsCurrentCursor)
    }
    if (activePage === 'Reviews') {
      void fetchReviews()
    }
    if (activePage === 'Daily Operations' || activePage === 'Unassigned tasks' || activePage === 'Visit templates') {
      void fetchProperties()
    }
    if (activePage === 'Cleaning Plan' || activePage === 'Cleaning Incidents' || activePage === 'Cleaning Billing' || activePage === 'Maintenance Incidents' || activePage === 'Maintenance Billing' || activePage === 'Maintenance settings') {
      void fetchProperties()
    }
  }, [
    activePage,
    bookingsCurrentCursor,
    fetchAlerts,
    fetchBookings,
    fetchInventory,
    fetchProperties,
    fetchPurchases,
    fetchReviews,
    fetchSubtractions,
  ])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activePage === 'Inventory') {
        void fetchInventory()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [activePage, fetchInventory])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const openNewItem = () => {
    setFormValues({
      ...emptyFormState,
      id: getNextInventoryId(inventoryRows),
    })
    setFormStep('details')
    setFormError(null)
    setIsFormOpen(true)
  }

  const openPurchaseWizard = (row: InventoryRow) => {
    setPurchaseFormValues({
      ...emptyPurchaseFormState,
      itemId: row.id,
      itemName: row.name,
      location: row.location,
      status: '',
      direct: false,
    })
    setPurchaseFormError(null)
    setIsPurchaseFormOpen(true)
  }

  const openDirectPurchaseWizard = () => {
    if (propertyRows.length === 0) {
      void fetchProperties()
    }
    setPurchaseFormValues({
      ...emptyPurchaseFormState,
      units: '1',
      billable: true,
      markup: false,
      direct: true,
    })
    setPurchaseFormError(null)
    setIsPurchaseFormOpen(true)
  }

  const openSubtractionWizard = (row: InventoryRow) => {
    if (propertyRows.length === 0) {
      void fetchProperties()
    }
    setSubtractionFormValues({
      ...emptySubtractionFormState,
      itemId: row.id,
      itemName: row.name,
      inventoryLocation: row.location,
      units: '1',
      cost: row.unitPrice ? String(row.unitPrice) : '0',
      billable: true,
      markup: false,
      note: '',
    })
    setSubtractionFormError(null)
    setIsSubtractionFormOpen(true)
  }

  const openPurchaseEdit = (row: PurchaseRow) => {
    if (row.direct && propertyRows.length === 0) {
      void fetchProperties()
    }
    setPurchaseFormValues({
      id: row.id,
      itemId: row.itemId === '—' ? '' : row.itemId,
      itemName: row.itemName === '—' ? '' : row.itemName,
      location: row.location === '—' ? '' : row.location,
      vendor: row.vendor === '—' ? '' : row.vendor,
      units: row.units ? String(row.units) : '',
      totalPrice: row.totalPrice ? String(row.totalPrice) : '',
      deliveryDate: formatDateForInput(row.deliveryDateRaw),
      purchaseDate: row.purchaseDateRaw,
      status: row.status || '',
      direct: row.direct,
      propertyId: row.propertyId,
      cost: row.cost ? String(row.cost) : '',
      billable: row.billable,
      markup: row.markupApplied,
      note: row.note,
    })
    setPurchaseFormError(null)
    setIsPurchaseFormOpen(true)
  }

  const openEditItem = (row: InventoryRow) => {
    const resolvedCategoryChoice =
      row.category && categoryOptions.includes(row.category)
        ? row.category
        : row.category
          ? OTHER_OPTION
          : ''
    const resolvedLocationChoice =
      row.location && locationOptions.includes(row.location)
        ? row.location
        : row.location
          ? OTHER_OPTION
          : ''

    setFormValues({
      id: row.id,
      name: row.name,
      nameEs: row.nameEs || '',
      categoryChoice: resolvedCategoryChoice,
      categoryOther: resolvedCategoryChoice === OTHER_OPTION ? row.category : '',
      locationChoice: resolvedLocationChoice,
      locationOther: resolvedLocationChoice === OTHER_OPTION ? row.location : '',
      quantity: row.quantity ? String(row.quantity) : '',
      rebuyQty: row.rebuyQty ? String(row.rebuyQty) : '',
      unitPrice: row.unitPrice ? String(row.unitPrice) : '',
      tolerance: row.tolerance ? String(row.tolerance) : '',
    })
    setFormStep('details')
    setFormError(null)
    setIsFormOpen(true)
  }

  const deleteItem = async (row: InventoryRow) => {
    const confirmed = window.confirm(
      t('inventory.deleteConfirm', { name: itemDisplayName(row), id: row.id }),
    )
    if (!confirmed) return

    const endpoint = getEndpoint(
      'deleteInventoryUrl',
      import.meta.env.VITE_DELETE_INVENTORY_URL,
    )
    if (!endpoint) {
      setError(t('inventory.missingDelete'))
      return
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      if (!response.ok) throw new Error('Failed to delete item.')
      await fetchInventory()
    } catch (deleteError) {
      setError(t('inventory.deleteError'))
    }
  }

  const toggleRow = (rowId: string) => {
    setExpandedRowIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const toggleAlertRow = (rowId: string) => {
    setExpandedAlertIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const togglePurchaseRow = (rowId: string) => {
    setExpandedPurchaseIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const toggleSubtractionRow = (rowId: string) => {
    setExpandedSubtractionIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const toggleSort = (key: 'name' | 'status') => {
    setSortConfig((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const togglePurchasesSort = () => {
    setPurchasesSortConfig((current) => ({
      key: 'date',
      direction:
        current.key === 'date' && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const toggleSubtractionsSort = () => {
    setSubtractionsSortConfig((current) => ({
      key: 'date',
      direction:
        current.key === 'date' && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const applySort = (rows: InventoryRow[]) => {
    if (!sortConfig.key) {
      return rows
    }
    const direction = sortConfig.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortConfig.key === 'name') {
        return (
          itemDisplayName(a).localeCompare(itemDisplayName(b), i18n.language) *
          direction
        )
      }
      if (sortConfig.key === 'status') {
        const statusDiff =
          (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0)
        if (statusDiff !== 0) {
          return statusDiff * direction
        }
        return (
          itemDisplayName(a).localeCompare(itemDisplayName(b), i18n.language) *
          direction
        )
      }
      return 0
    })
  }

  const applyPurchasesSort = (rows: PurchaseRow[]) => {
    if (!purchasesSortConfig.key) {
      return rows
    }
    const direction = purchasesSortConfig.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = getPurchaseSortTime(a)
      const right = getPurchaseSortTime(b)
      return (left - right) * direction
    })
  }

  const applySubtractionsSort = (rows: SubtractionRow[]) => {
    if (!subtractionsSortConfig.key) {
      return rows
    }
    const direction = subtractionsSortConfig.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = parseDateValue(a.dateRaw)?.getTime() ?? 0
      const right = parseDateValue(b.dateRaw)?.getTime() ?? 0
      return (left - right) * direction
    })
  }

  const alertsFilteredRows = useMemo(() => {
    return alertRows.filter((row) => {
      const statusMatch =
        alertsFilters.statuses.length === 0 ||
        alertsFilters.statuses.includes(row.status)
      const originMatch =
        alertsFilters.origins.length === 0 ||
        alertsFilters.origins.includes(row.origin)
      if (!statusMatch || !originMatch) {
        return false
      }
      return matchesTableSearch(tableSearchQuery, [
        row.id,
        row.name,
        row.description,
        row.status,
        row.origin,
        row.createdBy,
        row.date,
      ])
    })
  }, [
    alertRows,
    alertsFilters.origins,
    alertsFilters.statuses,
    tableSearchQuery,
  ])

  const alertsOriginOptions = useMemo(() => {
    const unique = new Set(alertRows.map((row) => row.origin).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [alertRows])

  const alertsStatusOptions = ['Pending', 'Snoozed', 'Done']

  const filteredRows = useMemo(() => {
    return inventoryRows.filter((row) => {
      const locationMatch =
        filters.locations.length === 0 ||
        filters.locations.includes(row.location)
      const statusMatch =
        filters.statuses.length === 0 || filters.statuses.includes(row.status)
      const categoryMatch =
        filters.categories.length === 0 ||
        filters.categories.includes(row.category)
      if (!locationMatch || !statusMatch || !categoryMatch) {
        return false
      }
      return matchesTableSearch(tableSearchQuery, [
        row.id,
        row.name,
        row.nameEs,
        row.location,
        row.status,
        row.category,
        row.quantity,
        row.updated,
      ])
    })
  }, [
    filters.locations,
    filters.statuses,
    filters.categories,
    inventoryRows,
    tableSearchQuery,
  ])

  const lowStockCount = useMemo(
    () => filteredRows.filter((row) => row.status === 'Low Stock').length,
    [filteredRows],
  )

  const reorderCount = useMemo(
    () => filteredRows.filter((row) => row.status === 'Reorder').length,
    [filteredRows],
  )

  const locationCount = useMemo(() => {
    const unique = new Set(filteredRows.map((row) => row.location).filter(Boolean))
    return unique.size
  }, [filteredRows])

  const activeFilterCount = useMemo(() => {
    return (
      filters.locations.length +
      filters.statuses.length +
      filters.categories.length
    )
  }, [filters.locations, filters.statuses, filters.categories])

  const isWarningsQuickFilterActive = useMemo(
    () =>
      filters.statuses.length === WARNING_STATUSES.length &&
      WARNING_STATUSES.every((status) => filters.statuses.includes(status)),
    [filters.statuses],
  )

  const toggleWarningsQuickFilter = () => {
    if (isWarningsQuickFilterActive) {
      setFilters((current) => ({ ...current, statuses: [] }))
      setFilterDraft((current) => ({ ...current, statuses: [] }))
      return
    }
    setFilters((current) => ({
      ...current,
      statuses: [...WARNING_STATUSES],
    }))
    setFilterDraft((current) => ({
      ...current,
      statuses: [...WARNING_STATUSES],
    }))
  }

  const locationOptions = useMemo(() => {
    const unique = new Set(
      inventoryRows.map((row) => row.location).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryRows])

  const categoryOptions = useMemo(() => {
    const unique = new Set(
      inventoryRows.map((row) => row.category).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryRows])

  const statusOptions = [
    'OK',
    'Waiting Delivery',
    'Low Stock',
    'Reorder',
    'Skipped',
  ]

  const propertiesFilteredRows = useMemo(() => {
    return propertyRows.filter((row) => {
      if (!isManagedProperty(row)) {
        return false
      }
      const statusValue = row.active ? 'Active' : 'Inactive'
      const statusMatch =
        propertiesFilters.statuses.length === 0 ||
        propertiesFilters.statuses.includes(statusValue)
      const roomTypeMatch =
        propertiesFilters.roomTypes.length === 0 ||
        propertiesFilters.roomTypes.includes(row.roomType)
      const typeMatch =
        propertiesFilters.types.length === 0 ||
        propertiesFilters.types.includes(row.type)
      const neighborhoodMatch =
        propertiesFilters.neighborhoods.length === 0 ||
        propertiesFilters.neighborhoods.includes(row.neighborhood)
      return statusMatch && typeMatch && roomTypeMatch && neighborhoodMatch
    })
  }, [
    propertyRows,
    propertiesFilters.neighborhoods,
    propertiesFilters.roomTypes,
    propertiesFilters.statuses,
    propertiesFilters.types,
  ])

  const propertiesActiveFilterCount = useMemo(() => {
    return (
      propertiesFilters.statuses.length +
      propertiesFilters.types.length +
      propertiesFilters.roomTypes.length +
      propertiesFilters.neighborhoods.length
    )
  }, [
    propertiesFilters.neighborhoods.length,
    propertiesFilters.roomTypes.length,
    propertiesFilters.statuses.length,
    propertiesFilters.types.length,
  ])

  const propertiesStatusOptions = ['Active', 'Inactive']

  const propertiesTypeOptions = useMemo(() => {
    const unique = new Set(propertyRows.map((row) => row.type).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [propertyRows])

  const activePropertiesCount = useMemo(() => {
    return propertyRows.filter(
      (row) => isManagedProperty(row) && row.active && row.type !== 'MTL',
    ).length
  }, [propertyRows])

  const filteredPropertiesCount = useMemo(() => {
    return propertiesFilteredRows.filter((row) => row.type !== 'MTL').length
  }, [propertiesFilteredRows])

  const sortedPropertiesRows = useMemo(() => {
    const direction = propertiesSortDirection === 'asc' ? 1 : -1
    return [...propertiesFilteredRows].sort(
      (a, b) => a.nickname.localeCompare(b.nickname) * direction,
    )
  }, [propertiesFilteredRows, propertiesSortDirection])

  const propertiesRoomTypeOptions = useMemo(() => {
    const unique = new Set(propertyRows.map((row) => row.roomType).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [propertyRows])

  const propertiesNeighborhoodOptions = useMemo(() => {
    const unique = new Set(
      propertyRows.map((row) => row.neighborhood).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [propertyRows])

  const bookingsStatusOptions = useMemo(() => {
    const unique = new Set([
      ...DEFAULT_BOOKING_STATUSES,
      ...bookingsAvailableStatuses,
      ...bookingRows.map((row) => row.status).filter(Boolean),
    ])
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [bookingRows, bookingsAvailableStatuses])

  const bookingsActiveFilterCount = useMemo(() => {
    const statusCount = listsMatchBookingStatuses(
      bookingsFilters.statuses,
      DEFAULT_BOOKING_STATUSES,
    )
      ? 0
      : 1
    return (
      statusCount +
      (bookingsFilters.checkInFrom ? 1 : 0) +
      (bookingsFilters.checkInTo ? 1 : 0)
    )
  }, [
    bookingsFilters.checkInFrom,
    bookingsFilters.checkInTo,
    bookingsFilters.statuses,
  ])

  const sortedBookingsRows = useMemo(() => {
    const direction = bookingsSortDirection === 'asc' ? 1 : -1
    return [...bookingRows].sort((a, b) => {
      const left = parseDateValue(a.checkInRaw)?.getTime() ?? 0
      const right = parseDateValue(b.checkInRaw)?.getTime() ?? 0
      return (left - right) * direction
    })
  }, [bookingRows, bookingsSortDirection])

  const reviewsFilteredRows = useMemo(() => {
    const minRating =
      reviewsFilters.minRating.trim() === ''
        ? null
        : Number(reviewsFilters.minRating)
    const maxRatingInput =
      reviewsFilters.maxRating.trim() === ''
        ? null
        : Number(reviewsFilters.maxRating)
    const maxRating =
      reviewsCreatedPreset === 'none'
        ? maxRatingInput
        : maxRatingInput !== null && Number.isFinite(maxRatingInput)
          ? Math.min(maxRatingInput, 4.99)
          : 4.99
    const createdFrom =
      reviewsCreatedPreset === 'none'
        ? reviewsFilters.createdFrom
          ? parseDateValue(reviewsFilters.createdFrom)
          : null
        : (() => {
            const now = new Date()
            const from = new Date(now)
            from.setDate(from.getDate() - (reviewsCreatedPreset === 'last7' ? 7 : 30))
            return from
          })()
    const createdTo =
      reviewsCreatedPreset === 'none'
        ? reviewsFilters.createdTo
          ? parseDateValue(reviewsFilters.createdTo)
          : null
        : new Date()

    return reviewRows.filter((row) => {
      if (
        reviewsFilters.listingNickname &&
        row.listingNickname !== reviewsFilters.listingNickname
      ) {
        return false
      }
      if (minRating !== null && Number.isFinite(minRating) && row.rating < minRating) {
        return false
      }
      if (maxRating !== null && Number.isFinite(maxRating) && row.rating > maxRating) {
        return false
      }

      const createdAt = parseDateValue(row.createdAtRaw)
      if (createdFrom && (!createdAt || createdAt < createdFrom)) {
        return false
      }
      if (createdTo && (!createdAt || createdAt > createdTo)) {
        return false
      }
      return true
    })
  }, [
    reviewRows,
    reviewsFilters.createdFrom,
    reviewsFilters.createdTo,
    reviewsFilters.listingNickname,
    reviewsFilters.maxRating,
    reviewsFilters.minRating,
    reviewsCreatedPreset,
  ])

  const sortedReviewsRows = useMemo(() => {
    const direction = reviewsSortDirection === 'asc' ? 1 : -1
    return [...reviewsFilteredRows].sort((a, b) => {
      const left = parseDateValue(a.createdAtRaw)?.getTime() ?? 0
      const right = parseDateValue(b.createdAtRaw)?.getTime() ?? 0
      return (left - right) * direction
    })
  }, [reviewsFilteredRows, reviewsSortDirection])

  const reviewsPropertyOptions = useMemo(() => {
    const unique = new Set(reviewRows.map((row) => row.listingNickname).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [reviewRows])

  const reviewsActiveFilterCount = useMemo(() => {
    return (
      (reviewsFilters.minRating ? 1 : 0) +
      (reviewsFilters.maxRating ? 1 : 0) +
      (reviewsCreatedPreset === 'none' && reviewsFilters.createdFrom ? 1 : 0) +
      (reviewsCreatedPreset === 'none' && reviewsFilters.createdTo ? 1 : 0) +
      (reviewsFilters.listingNickname ? 1 : 0) +
      (reviewsCreatedPreset !== 'none' ? 1 : 0)
    )
  }, [
    reviewsFilters.createdFrom,
    reviewsFilters.createdTo,
    reviewsFilters.listingNickname,
    reviewsFilters.maxRating,
    reviewsFilters.minRating,
    reviewsCreatedPreset,
  ])

  const reviewsPendingUnderFiveCount = useMemo(() => {
    return reviewRows.filter((row) => row.status.toLowerCase() === 'pending' && row.rating < 5).length
  }, [reviewRows])

  const goToRestockStep = () => {
    setFormError(null)
    if (!formValues.name.trim()) {
      setFormError(t('inventory.nameRequired'))
      return
    }
    const resolvedCategory = resolveChoice(
      formValues.categoryChoice,
      formValues.categoryOther,
    )
    if (!resolvedCategory) {
      setFormError(t('inventory.categoryRequired'))
      return
    }
    const resolvedLocation = resolveChoice(
      formValues.locationChoice,
      formValues.locationOther,
    )
    if (!resolvedLocation) {
      setFormError(t('inventory.locationRequired'))
      return
    }
    if (!formValues.quantity.trim()) {
      setFormError(t('inventory.quantityRequired'))
      return
    }
    setFormStep('restock')
  }

  const closeForm = () => {
    if (isSaving) {
      return
    }
    setIsFormOpen(false)
    setFormError(null)
    setFormStep('details')
  }

  const closePurchaseForm = () => {
    if (isPurchaseSaving) {
      return
    }
    setIsPurchaseFormOpen(false)
    setPurchaseFormError(null)
  }

  const closeSubtractionForm = () => {
    if (isSubtractionSaving) {
      return
    }
    setIsSubtractionFormOpen(false)
    setSubtractionFormError(null)
  }

  const savePurchase = async () => {
    const endpoint = getEndpoint(
      'upsertPurchaseUrl',
      import.meta.env.VITE_UPSERT_PURCHASE_URL,
    )
    if (!endpoint) {
      setPurchaseFormError(
        'Missing purchase endpoint. Set VITE_UPSERT_PURCHASE_URL in the environment.',
      )
      return
    }

    if (!purchaseFormValues.direct && !purchaseFormValues.itemId.trim()) {
      setPurchaseFormError('Item ID is required.')
      return
    }
    if (!purchaseFormValues.itemName.trim()) {
      setPurchaseFormError(t('purchases.itemNameRequired'))
      return
    }
    if (purchaseFormValues.direct && !purchaseFormValues.propertyId.trim()) {
      setPurchaseFormError(t('purchases.propertyRequired'))
      return
    }
    if (!purchaseFormValues.direct && !purchaseFormValues.location.trim()) {
      setPurchaseFormError(t('purchases.locationRequired'))
      return
    }
    if (!purchaseFormValues.vendor.trim()) {
      setPurchaseFormError(t('purchases.vendorRequired'))
      return
    }
    if (!purchaseFormValues.units.trim()) {
      setPurchaseFormError(t('purchases.unitsRequired'))
      return
    }
    const unitsValue = Number(purchaseFormValues.units)
    if (!Number.isFinite(unitsValue) || unitsValue <= 0) {
      setPurchaseFormError(t('purchases.unitsPositive'))
      return
    }
    if (purchaseFormValues.direct && !purchaseFormValues.cost.trim()) {
      setPurchaseFormError(t('purchases.costRequired'))
      return
    }
    if (purchaseFormValues.direct) {
      const costCheck = Number(purchaseFormValues.cost)
      if (!Number.isFinite(costCheck) || costCheck < 0) {
        setPurchaseFormError(t('purchases.costInvalid'))
        return
      }
    }
    if (!purchaseFormValues.direct && !purchaseFormValues.totalPrice.trim()) {
      setPurchaseFormError(t('purchases.totalPriceRequired'))
      return
    }
    if (!purchaseFormValues.deliveryDate.trim()) {
      setPurchaseFormError(t('purchases.deliveryDateRequired'))
      return
    }

    setIsPurchaseSaving(true)
    setPurchaseFormError(null)

    const statusValue = isReceivedPurchaseStatus(purchaseFormValues.status)
      ? purchaseFormValues.status
      : undefined
    const costValue = Number(purchaseFormValues.cost) || 0
    const pricing = computeSubtractionPricing(
      costValue,
      purchaseFormValues.markup,
    )
    const selectedProperty = activePropertyOptions.find(
      (property) => property.id === purchaseFormValues.propertyId,
    )
    const payload = purchaseFormValues.direct
      ? {
          id: purchaseFormValues.id.trim() || undefined,
          Direct: true,
          'Item id': '',
          'Item name': purchaseFormValues.itemName.trim(),
          'Property id': purchaseFormValues.propertyId.trim(),
          Location: selectedProperty?.nickname || purchaseFormValues.location.trim(),
          Vendor: purchaseFormValues.vendor.trim(),
          Units: unitsValue,
          Cost: costValue,
          Billable: purchaseFormValues.billable,
          'Markup applied': purchaseFormValues.markup,
          Markup: pricing.markup,
          'IVA Markup': pricing.ivaMarkup,
          'Price excl. IVA': pricing.priceExclIva,
          IVA: pricing.iva,
          'Total price': pricing.totalPrice,
          Note: purchaseFormValues.note.trim(),
          'Delivery date': formatDateForStorage(purchaseFormValues.deliveryDate),
          'Purchase date': formatDateForStorage(
            purchaseFormValues.purchaseDate?.trim() || '',
          ),
          ...(statusValue ? { Status: statusValue } : {}),
        }
      : {
          id: purchaseFormValues.id.trim() || undefined,
          Direct: false,
          'Item id': purchaseFormValues.itemId.trim(),
          'Item name': purchaseFormValues.itemName.trim(),
          Location: purchaseFormValues.location.trim(),
          Vendor: purchaseFormValues.vendor.trim(),
          Units: unitsValue,
          'Total price': Number(purchaseFormValues.totalPrice) || 0,
          'Delivery date': formatDateForStorage(purchaseFormValues.deliveryDate),
          'Purchase date': formatDateForStorage(
            purchaseFormValues.purchaseDate?.trim() || '',
          ),
          ...(statusValue ? { Status: statusValue } : {}),
        }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Failed to save purchase (${response.status}). ${errorText}`.trim(),
        )
      }
      const responseBody = (await response.json()) as {
        item?: Record<string, unknown>
      }
      const item = responseBody.item ? mapPurchaseRow(responseBody.item) : null
      const updatedRow: PurchaseRow =
        item ??
        mapPurchaseRow({
          ...payload,
          id: payload.id ?? '',
        })

      const wasAlreadyReceived = purchaseRows.some(
        (entry) =>
          entry.id === updatedRow.id && isReceivedPurchaseStatus(entry.status),
      )
      const hasOtherOpenPurchases = purchaseRows.some(
        (entry) =>
          !entry.direct &&
          entry.itemId === updatedRow.itemId &&
          entry.id !== updatedRow.id &&
          !isReceivedPurchaseStatus(entry.status),
      )
      setPurchaseRows((current) => {
        const existingIndex = current.findIndex(
          (row) => row.id === updatedRow.id,
        )
        if (existingIndex >= 0) {
          const copy = [...current]
          copy[existingIndex] = updatedRow
          return copy
        }
        return [updatedRow, ...current]
      })
      if (!updatedRow.direct) {
        if (isReceivedPurchaseStatus(updatedRow.status) && !wasAlreadyReceived) {
          setInventoryRows((current) =>
            applyConfirmedPurchaseToInventory(
              current,
              updatedRow.itemId,
              updatedRow.units,
              updatedRow.totalPrice,
              hasOtherOpenPurchases ? 'Waiting Delivery' : undefined,
            ),
          )
        } else if (!isReceivedPurchaseStatus(updatedRow.status)) {
          setInventoryRows((current) =>
            markInventoryWaitingDelivery(current, updatedRow.itemId),
          )
        }
      }

      setIsPurchaseFormOpen(false)
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save the purchase. Please try again.'
      setPurchaseFormError(message)
    } finally {
      setIsPurchaseSaving(false)
    }
  }

  const confirmPurchaseDelivery = async (row: PurchaseRow) => {
    if (row.status === 'Confirmed') {
      return
    }
    const nextStatus =
      row.status === PURCHASE_WAITING_INVOICE
        ? 'Confirmed'
        : PURCHASE_WAITING_INVOICE
    const shouldConfirm = window.confirm(
      nextStatus === 'Confirmed'
        ? t('purchases.confirmInvoicePrompt')
        : row.direct
          ? t('purchases.confirmDirectDeliveryPrompt')
          : t('purchases.confirmDeliveryPrompt'),
    )
    if (!shouldConfirm) {
      return
    }
    const endpoint = getEndpoint(
      'upsertPurchaseUrl',
      import.meta.env.VITE_UPSERT_PURCHASE_URL,
    )
    if (!endpoint) {
      setPurchasesError(
        'Missing purchase endpoint. Set VITE_UPSERT_PURCHASE_URL in the environment.',
      )
      return
    }

    try {
      const payload = {
        id: row.id,
        Direct: row.direct,
        'Item id': row.direct ? '' : row.itemId,
        'Item name': row.itemName,
        'Property id': row.propertyId,
        Location: row.location,
        Vendor: row.vendor,
        Units: row.units,
        Cost: row.cost,
        Billable: row.billable,
        'Markup applied': row.markupApplied,
        Markup: row.markup,
        'IVA Markup': row.ivaMarkup,
        'Price excl. IVA': row.priceExclIva,
        IVA: row.iva,
        'Total price': row.totalPrice,
        Note: row.note,
        'Delivery date': formatDateForStorage(row.deliveryDateRaw),
        'Purchase date': formatDateForStorage(row.purchaseDateRaw),
        Status: nextStatus,
      }
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Failed to update purchase.')
      }
      const hasOtherOpenPurchases = purchaseRows.some(
        (entry) =>
          !entry.direct &&
          entry.itemId === row.itemId &&
          entry.id !== row.id &&
          !isReceivedPurchaseStatus(entry.status),
      )
      const shouldUpdateInventory =
        !row.direct && !isReceivedPurchaseStatus(row.status)
      setPurchaseRows((current) =>
        current.map((entry) =>
          entry.id === row.id ? { ...entry, status: nextStatus } : entry,
        ),
      )
      if (shouldUpdateInventory) {
        setInventoryRows((current) =>
          applyConfirmedPurchaseToInventory(
            current,
            row.itemId,
            row.units,
            row.totalPrice,
            hasOtherOpenPurchases ? 'Waiting Delivery' : undefined,
          ),
        )
      }
    } catch (updateError) {
      setPurchasesError(t('purchases.updateStatusError'))
    }
  }

  const saveSubtraction = async () => {
    const endpoint = getEndpoint(
      'upsertSubtractionUrl',
      import.meta.env.VITE_UPSERT_SUBTRACTION_URL,
    )
    if (!endpoint) {
      setSubtractionFormError(
        'Missing subtraction endpoint. Set VITE_UPSERT_SUBTRACTION_URL in the environment.',
      )
      return
    }

    if (!subtractionFormValues.itemId.trim()) {
      setSubtractionFormError(t('subtractions.itemIdRequired'))
      return
    }
    if (!subtractionFormValues.itemName.trim()) {
      setSubtractionFormError(t('subtractions.itemNameRequired'))
      return
    }
    if (!subtractionFormValues.propertyId.trim()) {
      setSubtractionFormError(t('subtractions.propertyRequired'))
      return
    }
    if (!subtractionFormValues.location.trim()) {
      setSubtractionFormError(t('subtractions.propertyRequired'))
      return
    }
    if (!subtractionFormValues.units.trim()) {
      setSubtractionFormError(t('subtractions.unitsRequired'))
      return
    }
    const unitsValue = Number(subtractionFormValues.units)
    if (!Number.isFinite(unitsValue) || unitsValue <= 0) {
      setSubtractionFormError(t('subtractions.unitsPositive'))
      return
    }
    if (!subtractionFormValues.cost.trim()) {
      setSubtractionFormError(t('subtractions.costRequired'))
      return
    }
    const costValue = Number(subtractionFormValues.cost)
    if (!Number.isFinite(costValue) || costValue < 0) {
      setSubtractionFormError(t('subtractions.costInvalid'))
      return
    }

    const inventoryItem = inventoryRows.find(
      (row) => row.id === subtractionFormValues.itemId,
    )
    if (inventoryItem && unitsValue > inventoryItem.quantity) {
      setSubtractionFormError(
        `Only ${inventoryItem.quantity} unit(s) available in inventory.`,
      )
      return
    }

    const pricing = computeSubtractionPricing(
      costValue,
      subtractionFormValues.markup,
    )

    setIsSubtractionSaving(true)
    setSubtractionFormError(null)

    const payload = {
      'Item id': subtractionFormValues.itemId.trim(),
      'Item name': subtractionFormValues.itemName.trim(),
      'Inventory location': subtractionFormValues.inventoryLocation.trim(),
      'Property id': subtractionFormValues.propertyId.trim(),
      Location: subtractionFormValues.location.trim(),
      Units: unitsValue,
      Cost: costValue,
      Billable: subtractionFormValues.billable,
      'Markup applied': subtractionFormValues.markup,
      Markup: pricing.markup,
      'IVA Markup': pricing.ivaMarkup,
      'Price excl. IVA': pricing.priceExclIva,
      IVA: pricing.iva,
      'Total Price': pricing.totalPrice,
      Note: subtractionFormValues.note.trim(),
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errorText = await response.text()
        let message = 'Failed to save subtraction.'
        try {
          const errorBody = JSON.parse(errorText) as { message?: string }
          if (errorBody.message) {
            message = errorBody.message
          }
        } catch {
          // Keep default message.
        }
        throw new Error(message)
      }
      const responseBody = (await response.json()) as {
        item?: Record<string, unknown>
      }
      const item = responseBody.item
        ? mapSubtractionRow(responseBody.item)
        : null
      const updatedRow: SubtractionRow =
        item ??
        mapSubtractionRow({
          ...payload,
          id: '',
          Date: formatDateForStorage(''),
          Status: subtractionFormValues.billable
            ? 'Pending Billing'
            : 'Not Billable',
        })

      setSubtractionRows((current) => [updatedRow, ...current])
      setInventoryRows((current) =>
        current.map((row) => {
          if (row.id !== subtractionFormValues.itemId) {
            return row
          }
          const nextQuantity = Math.max(0, row.quantity - unitsValue)
          return {
            ...row,
            quantity: nextQuantity,
            status:
              row.status === 'Waiting Delivery'
                ? 'Waiting Delivery'
                : computeInventoryStatus(nextQuantity, row.rebuyQty),
          }
        }),
      )
      setIsSubtractionFormOpen(false)
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save the subtraction. Please try again.'
      setSubtractionFormError(message)
    } finally {
      setIsSubtractionSaving(false)
    }
  }

  const markSubtractionBilled = async (row: SubtractionRow) => {
    if (row.status !== 'Pending Billing') {
      return
    }
    const shouldConfirm = window.confirm(
      t('subtractions.markBilledPrompt'),
    )
    if (!shouldConfirm) {
      return
    }
    const endpoint = getEndpoint(
      'upsertSubtractionUrl',
      import.meta.env.VITE_UPSERT_SUBTRACTION_URL,
    )
    if (!endpoint) {
      setSubtractionsError(
        'Missing subtraction endpoint. Set VITE_UPSERT_SUBTRACTION_URL in the environment.',
      )
      return
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: row.id,
          action: 'mark_billed',
        }),
      })
      if (!response.ok) {
        throw new Error('Failed to update subtraction.')
      }
      const responseBody = (await response.json()) as {
        item?: Record<string, unknown>
      }
      const updated = responseBody.item
        ? mapSubtractionRow(responseBody.item)
        : { ...row, status: 'Billed' }
      setSubtractionRows((current) =>
        current.map((entry) => (entry.id === row.id ? updated : entry)),
      )
    } catch (updateError) {
      setSubtractionsError(
        'Unable to mark subtraction as billed. Please try again.',
      )
    }
  }

  const reverseSubtraction = async (row: SubtractionRow) => {
    if (row.status === 'Reversed') {
      return
    }
    const shouldConfirm = window.confirm(
      t('subtractions.reversePrompt'),
    )
    if (!shouldConfirm) {
      return
    }
    const endpoint = getEndpoint(
      'upsertSubtractionUrl',
      import.meta.env.VITE_UPSERT_SUBTRACTION_URL,
    )
    if (!endpoint) {
      setSubtractionsError(
        'Missing subtraction endpoint. Set VITE_UPSERT_SUBTRACTION_URL in the environment.',
      )
      return
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: row.id,
          action: 'reverse',
        }),
      })
      if (!response.ok) {
        throw new Error('Failed to reverse subtraction.')
      }
      const responseBody = (await response.json()) as {
        item?: Record<string, unknown>
      }
      const updated = responseBody.item
        ? mapSubtractionRow(responseBody.item)
        : { ...row, status: 'Reversed' }
      setSubtractionRows((current) =>
        current.map((entry) => (entry.id === row.id ? updated : entry)),
      )
      setInventoryRows((current) =>
        current.map((entry) => {
          if (entry.id !== row.itemId) {
            return entry
          }
          const nextQuantity = entry.quantity + row.units
          return {
            ...entry,
            quantity: nextQuantity,
            status:
              entry.status === 'Waiting Delivery'
                ? 'Waiting Delivery'
                : computeInventoryStatus(nextQuantity, entry.rebuyQty),
          }
        }),
      )
    } catch (updateError) {
      setSubtractionsError(
        'Unable to reverse subtraction. Please try again.',
      )
    }
  }

  const saveItem = async () => {
    const endpoint = getEndpoint(
      'upsertInventoryUrl',
      import.meta.env.VITE_UPSERT_INVENTORY_URL,
    )
    if (!endpoint) {
      setFormError(t('inventory.missingUpsert'))
      return
    }

    if (!formValues.name.trim()) {
      setFormError(t('inventory.nameRequired'))
      return
    }

    const resolvedCategory = resolveChoice(
      formValues.categoryChoice,
      formValues.categoryOther,
    )
    if (!resolvedCategory) {
      setFormError(t('inventory.categoryRequired'))
      return
    }

    const resolvedLocation = resolveChoice(
      formValues.locationChoice,
      formValues.locationOther,
    )
    if (!resolvedLocation) {
      setFormError(t('inventory.locationRequired'))
      return
    }

    if (!formValues.quantity.trim()) {
      setFormError(t('inventory.quantityRequired'))
      return
    }

    setIsSaving(true)
    setFormError(null)

    const itemId = formValues.id.trim() || getNextInventoryId(inventoryRows)
    const quantityValue = Number(formValues.quantity) || 0
    const rebuyQtyValue = Number(formValues.rebuyQty) || 0
    const statusValue = computeInventoryStatus(quantityValue, rebuyQtyValue)
    const lastUpdatedValue = formatDateForStorage('')
    const createdBy = await getCurrentUserEmail()

    const payload = {
      id: itemId,
      'Item name': formValues.name.trim(),
      nameEs: formValues.nameEs.trim(),
      category: resolvedCategory,
      Location: resolvedLocation,
      Status: statusValue,
      Quantity: quantityValue,
      'Last updated': lastUpdatedValue,
      rebuyQty: rebuyQtyValue,
      unitPrice: Number(formValues.unitPrice) || 0,
      Tolerance: Number(formValues.tolerance) || 0,
      createdBy,
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Failed to save inventory item.')
      }

      setIsFormOpen(false)
      await fetchInventory()
    } catch (saveError) {
      setFormError(t('inventory.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const updateAlertStatus = async (
    id: string,
    status: 'Done' | 'Snoozed',
    snoozeUntil?: string,
  ) => {
    const endpoint = getEndpoint(
      'updateAlertStatusUrl',
      import.meta.env.VITE_UPDATE_ALERT_STATUS_URL,
    )
    if (!endpoint) {
      setAlertsError(
        'Missing alerts update endpoint. Set VITE_UPDATE_ALERT_STATUS_URL in the environment.',
      )
      return
    }

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id, status, snoozeUntil }),
      })
      if (!response.ok) {
        throw new Error('Failed to update alert.')
      }
      setAlertRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                status,
                snoozeUntil,
              }
            : row,
        ),
      )
    } catch (updateError) {
      setAlertsError(t('alerts.updateError'))
    }
  }

  const toggleSection = (section: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed((current) => {
      if (!current) {
        setCollapsedSections(new Set(navigation.map((group) => group.section)))
      }
      return !current
    })
  }

  const navigateToPage = (page: string) => {
    setActivePage(page)
    setIsMobileNavOpen(false)
    setIsSummaryInfoOpen(false)
    setIsMobileSearchOpen(false)
    setTableSearchQuery('')
  }

  const openMobileNav = () => {
    setIsSidebarCollapsed(false)
    setIsMobileNavOpen(true)
  }

  const closeMobileNav = () => {
    setIsMobileNavOpen(false)
  }

  const handleSectionShortcut = (section: string) => {
    setIsSidebarCollapsed(false)
    setCollapsedSections((current) => {
      const next = new Set(current)
      next.delete(section)
      return next
    })
  }

  useEffect(() => {
    if (!isMobileNavOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false)
      }
    }
    document.body.classList.add('mobile-nav-open')
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('mobile-nav-open')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileNavOpen])

  useEffect(() => {
    setTitleProgress(0)
    window.scrollTo({ top: 0, behavior: 'auto' })

    const main = document.querySelector('main.main')

    const updateTitleProgress = () => {
      const isMobileViewport = window.matchMedia('(max-width: 768px)').matches
      if (!isMobileViewport) {
        setTitleProgress(0)
        return
      }
      const windowScroll = window.scrollY || document.documentElement.scrollTop
      const mainScroll = main instanceof HTMLElement ? main.scrollTop : 0
      const next = Math.min(
        1,
        Math.max(
          0,
          Math.max(windowScroll, mainScroll) / MOBILE_TITLE_COLLAPSE_DISTANCE,
        ),
      )
      setTitleProgress(next)
    }

    updateTitleProgress()
    window.addEventListener('scroll', updateTitleProgress, { passive: true })
    window.addEventListener('resize', updateTitleProgress)
    main?.addEventListener('scroll', updateTitleProgress, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateTitleProgress)
      window.removeEventListener('resize', updateTitleProgress)
      main?.removeEventListener('scroll', updateTitleProgress)
    }
  }, [activePage])

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isMobileSearchOpen, activePage])

  const mobileSearchPlaceholder = (() => {
    switch (activePage) {
      case 'Inventory':
        return t('inventory.search')
      case 'Purchases':
        return t('purchases.search')
      case 'Subtractions':
        return t('subtractions.search')
      case 'Alerts':
        return t('alerts.search')
      case 'Logs':
        return t('logs.search')
      case 'Cleaning Incidents':
        return t('cleaningIncidents.search')
      case 'Maintenance Incidents':
        return t('maintenanceIncidents.search')
      default:
        return t('common.showSearch')
    }
  })()

  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false)
  }

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true)
  }

  return (
    <div
      className={`app ${isSidebarCollapsed ? 'app-collapsed' : ''} ${
        isMobileNavOpen ? 'mobile-nav-is-open' : ''
      }`}
      style={
        {
          '--title-progress': String(titleProgress),
        } as CSSProperties
      }
    >
      <MobileBodyPortal>
      <header
        className={`mobile-topbar ${titleProgress >= 0.25 ? 'is-frosted' : ''} ${
          titleProgress >= 0.99 ? 'is-collapsed' : ''
        } ${isMobileSearchOpen ? 'is-search-open' : ''}`}
        style={
          {
            '--title-progress': String(titleProgress),
          } as CSSProperties
        }
      >
        <div className="mobile-topbar-title-group">
          {!isMobileSearchOpen ? (
            <h1 className="mobile-topbar-section-title">
              {pageLabel(activePage)}
            </h1>
          ) : null}
          {pagesWithMobileSearch.has(activePage) ? (
            isMobileSearchOpen ? (
              <input
                ref={mobileSearchInputRef}
                className="mobile-topbar-search-input"
                type="search"
                placeholder={mobileSearchPlaceholder}
                aria-label={mobileSearchPlaceholder}
                value={tableSearchQuery}
                onChange={(event) => setTableSearchQuery(event.target.value)}
              />
            ) : (
              <button
                type="button"
                className="mobile-topbar-search-button"
                aria-label={t('common.showSearch')}
                onClick={openMobileSearch}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="18"
                  height="18"
                >
                  <path
                    d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )
          ) : null}
        </div>
        <button
          className="btn-icon btn-icon-ghost mobile-menu-button"
          type="button"
          aria-label={
            isMobileSearchOpen
              ? t('common.hideSearch')
              : isMobileNavOpen
                ? t('common.closeMenu')
                : t('common.openMenu')
          }
          aria-expanded={isMobileSearchOpen ? undefined : isMobileNavOpen}
          onClick={() => {
            if (isMobileSearchOpen) {
              closeMobileSearch()
              return
            }
            if (isMobileNavOpen) {
              closeMobileNav()
              return
            }
            openMobileNav()
          }}
        >
          {isMobileSearchOpen || isMobileNavOpen ? (
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </header>
      </MobileBodyPortal>

      <div
        className={`mobile-nav-backdrop ${isMobileNavOpen ? 'is-visible' : ''}`}
        onClick={closeMobileNav}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''} ${
          isMobileNavOpen ? 'is-mobile-open' : ''
        }`}
      >
        <div className="brand">
          <span className="brand-title">
            {isSidebarCollapsed ? 'Y!' : 'Yalla!'}
          </span>
          <button
            className="btn-icon btn-icon-ghost mobile-nav-close"
            type="button"
            aria-label={t('common.closeMenu')}
            onClick={closeMobileNav}
          >
            ✕
          </button>
        </div>
        <nav className="nav">
          {!isSidebarCollapsed ? (
            <ul className="nav-items nav-items-primary">
              {coreItems.map((item) => {
                const isActive = activePage === item
                return (
                  <li key={item}>
                    <button
                      className={`nav-button ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      type="button"
                      onClick={() => navigateToPage(item)}
                    >
                      <span>{navItemLabel(item)}</span>
                      {item === 'Alerts' && pendingAlertsCount > 0 ? (
                        <span className="nav-badge">{pendingAlertsCount}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {isSidebarCollapsed ? (
            <>
              <ul className="nav-items nav-items-primary nav-items-collapsed">
                {coreItems.map((item) => {
                  const isActive = activePage === item
                  return (
                    <li key={item}>
                      <button
                        className={`nav-button nav-icon-button ${
                          isActive ? 'active' : ''
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                        type="button"
                        onClick={() => navigateToPage(item)}
                        aria-label={navItemLabel(item)}
                      >
                        {item === 'Alerts' ? (
                          <>
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              width="16"
                              height="16"
                            >
                              <path
                                d="M10 3a4 4 0 0 1 4 4v2.4l1.2 2.4H4.8L6 9.4V7a4 4 0 0 1 4-4zm-2.2 12a2.2 2.2 0 0 0 4.4 0h-4.4z"
                                fill="currentColor"
                              />
                            </svg>
                          </>
                        ) : item === 'Chatbot' ? (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            width="16"
                            height="16"
                          >
                            <path
                              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v4A2.5 2.5 0 0 1 13.5 12H9l-3.5 3.5V12H6.5A2.5 2.5 0 0 1 4 9.5v-4z"
                              fill="currentColor"
                            />
                          </svg>
                        ) : (
                          <span>{item.charAt(0)}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <ul className="nav-items nav-section-shortcuts">
                {navigation.map((group) => (
                  <li key={group.section}>
                    <button
                      className="nav-button nav-section-shortcut"
                      type="button"
                      aria-label={t('common.openSection', {
                        section: sectionLabel(group.section),
                      })}
                      onClick={() => handleSectionShortcut(group.section)}
                    >
                      {group.section.charAt(0)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {navigation.map((group) => (
            <div className="nav-section" key={group.section}>
              <button
                className="nav-section-title nav-section-toggle"
                type="button"
                onClick={() => toggleSection(group.section)}
                aria-expanded={!collapsedSections.has(group.section)}
              >
                <span>{sectionLabel(group.section)}</span>
                <span className="nav-section-caret">
                  {collapsedSections.has(group.section) ? '▸' : '▾'}
                </span>
              </button>
              {!collapsedSections.has(group.section) ? (
                <ul className="nav-items">
                  {group.items.map((item) => {
                    const isActive = activePage === item
                    return (
                      <li key={item}>
                        <button
                          className={`nav-button ${isActive ? 'active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          type="button"
                          onClick={() => navigateToPage(item)}
                        >
                          {navItemLabel(item)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </nav>
        <SettingsPanel
          compact={isSidebarCollapsed}
          onOpen={closeMobileNav}
        />
      </aside>
      <button
        className={`btn-icon btn-icon-ghost sidebar-toggle ${
          isSidebarCollapsed ? 'is-collapsed' : ''
        }`}
        type="button"
        aria-label={
          isSidebarCollapsed
            ? t('common.expandSidebar')
            : t('common.collapseSidebar')
        }
        onClick={handleSidebarToggle}
      >
        {isSidebarCollapsed ? '›' : '‹'}
      </button>

      <main className="main">
        {activePage === 'Inventory' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('inventory.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Inventory')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('inventory.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div
                className={`page-action-bar ${
                  isMobileSearchOpen ? 'is-search-open' : ''
                }`}
              >
                <input
                  className="search-input"
                  placeholder={t('inventory.search')}
                  type="search"
                  aria-label={t('inventory.search')}
                  value={tableSearchQuery}
                  onChange={(event) => setTableSearchQuery(event.target.value)}
                />
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-search-toggle ${
                    isMobileSearchOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={
                    isMobileSearchOpen
                      ? t('common.hideSearch')
                      : t('common.showSearch')
                  }
                  aria-expanded={isMobileSearchOpen}
                  onClick={() =>
                    setIsMobileSearchOpen((current) => !current)
                  }
                >
                  {isMobileSearchOpen ? (
                    <span aria-hidden="true">✕</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
                <button
                  className={`btn-ghost btn-filter ${
                    isFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setFilterDraft({
                      locations: [...filters.locations],
                      statuses: [...filters.statuses],
                      categories: [...filters.categories],
                    })
                    setIsFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {activeFilterCount > 0 ? (
                    <span className="filter-badge">{activeFilterCount}</span>
                  ) : null}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setIsInventoryExportOpen(true)}
                  disabled={isExporting}
                  aria-label={t('common.export')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M10 3v8.2l2.4-2.4 1.4 1.4-4.8 4.8-4.8-4.8 1.4-1.4L8 11.2V3h2zm-6 12h12v2H4v-2z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={openNewItem}
                  aria-label={t('common.addItem')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  className="btn-primary"
                  onClick={fetchInventory}
                  type="button"
                  disabled={isLoading}
                  aria-label={t('common.refresh')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {error ? <div className="alert">{error}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('inventory.locations')}</p>
                <p className="card-value">{locationCount}</p>
                <p className="card-meta">{t('inventory.locationsMeta')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('inventory.reorder')}</p>
                <p className="card-value">{reorderCount}</p>
                <p className="card-meta">{t('inventory.reorderMeta')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('inventory.lowStock')}</p>
                <p className="card-value">{lowStockCount}</p>
                <p className="card-meta">{t('inventory.lowStockMeta')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('inventory.cardTitle')}</h2>
                  <p className="card-subtitle">{t('inventory.cardSubtitle')}</p>
                </div>
              </div>

              {isFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Select one or more values to filter the inventory.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.location')}</p>
                          <div className="filter-options">
                            {locationOptions.map((option) => {
                              const isChecked =
                                filterDraft.locations.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            locations: [
                                              ...current.locations,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          locations: current.locations.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('common.category')}</p>
                          <div className="filter-options">
                            {categoryOptions.map((option) => {
                              const isChecked =
                                filterDraft.categories.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            categories: [
                                              ...current.categories,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          categories:
                                            current.categories.filter(
                                              (value) => value !== option,
                                            ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {statusOptions.map((option) => {
                              const isChecked =
                                filterDraft.statuses.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [
                                              ...current.statuses,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => {
                          setFilterDraft({
                            locations: [],
                            statuses: [],
                            categories: [],
                          })
                        }}
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setFilters({
                            locations: [...filterDraft.locations],
                            statuses: [...filterDraft.statuses],
                            categories: [...filterDraft.categories],
                          })
                          setIsFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <ExportScopeModal
                isOpen={isInventoryExportOpen}
                isExporting={isExporting}
                onClose={() => setIsInventoryExportOpen(false)}
                onSelect={(scope) => {
                  const ids =
                    scope === 'filtered'
                      ? filteredRows
                          .map((row) => row.id)
                          .filter((id) => id && id !== '—')
                      : undefined
                  void exportInventory(ids).then((ok) => {
                    if (ok) {
                      setIsInventoryExportOpen(false)
                    }
                  })
                }}
              />

              <div className="table-wrapper" aria-busy={isLoading}>
                <table className="data-table data-table-inventory">
                  <thead>
                    <tr>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            sortConfig.key === 'name' ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() => toggleSort('name')}
                        >
                          {t('common.name')}
                          <span className="sort-indicator">
                            {sortConfig.key === 'name'
                              ? sortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">{t('common.location')}</th>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            sortConfig.key === 'status' ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() => toggleSort('status')}
                        >
                          {t('common.status')}
                          <span className="sort-indicator">
                            {sortConfig.key === 'status'
                              ? sortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            isWarningsQuickFilterActive ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={isWarningsQuickFilterActive}
                          onClick={toggleWarningsQuickFilter}
                        >
                          {t('inventory.quickFilterWarnings')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col">{t('common.quantity')}</th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                    <td className="table-empty" colSpan={5}>
                          {t('inventory.loading')}
                        </td>
                      </tr>
                    ) : inventoryRows.length === 0 ? (
                      <tr>
                    <td className="table-empty" colSpan={5}>
                          {t('inventory.empty')}
                        </td>
                      </tr>
                ) : (
                  applySort(filteredRows).map((row) => {
                      const isExpanded = expandedRowIds.has(row.id)
                      return (
                        <Fragment key={row.id}>
                        <tr>
                          <td>{itemDisplayName(row)}</td>
                          <td>{row.location}</td>
                          <td>
                            <span className={getStatusClassName(row.status)}>
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td>{row.quantity}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => openPurchaseWizard(row)}
                                aria-label={t('common.createPurchase')}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  width="16"
                                  height="16"
                                >
                                  <path
                                    d="M6.2 5h9.6l-1 6H7.6l-1.4-6zM5 5H3.5a.5.5 0 0 0 0 1H4l1.8 7.4a1 1 0 0 0 1 .8h7.8a1 1 0 0 0 1-.8l1.1-6.4a.5.5 0 0 0-.5-.6H6.2zm3.3 10.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm5 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => openSubtractionWizard(row)}
                                aria-label={t('common.createSubtraction')}
                                title={t('common.subtract')}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  width="16"
                                  height="16"
                                >
                                  <path
                                    d="M4 9.25h12v1.5H4z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => openEditItem(row)}
                                aria-label={t('common.edit')}
                              >
                                ✎
                              </button>
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => deleteItem(row)}
                                aria-label={t('common.delete')}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  width="16"
                                  height="16"
                                >
                                  <path
                                    d="M6 2a2 2 0 0 0-2 2v1h12V4a2 2 0 0 0-2-2H6zm11 4H3v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6zM8 8v6m4-6v6"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => toggleRow(row.id)}
                                aria-expanded={isExpanded}
                                aria-label={t('common.toggleDetails')}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="detail-row">
                            <td colSpan={5}>
                              <div className="detail-grid">
                                <div>
                                  <p className="detail-label">{t('common.itemId')}</p>
                                  <p className="detail-value">{row.id}</p>
                                </div>
                                <div>
                                  <p className="detail-label">{t('common.category')}</p>
                                  <p className="detail-value">
                                    {row.category || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">{t('common.lastUpdated')}</p>
                                  <p className="detail-value">{row.updated}</p>
                                </div>
                                <div>
                                  <p className="detail-label">{t('common.rebuyQty')}</p>
                                  <p className="detail-value">
                                    {row.rebuyQty || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">{t('common.unitPrice')}</p>
                                  <p className="detail-value">
                                    {formatUnitPrice(row.unitPrice)}
                                  </p>
                                </div>
                                <div className="detail-span">
                                  <p className="detail-label">
                                    {t('inventory.recentPurchases')}
                                  </p>
                                  {(() => {
                                    const recent = getRecentPurchasesForItem(
                                      row.id,
                                      purchaseRows,
                                      3,
                                    )
                                    if (recent.length === 0) {
                                      return (
                                        <p className="detail-value detail-muted">
                                          {t('inventory.noRecentPurchases')}
                                        </p>
                                      )
                                    }
                                    return (
                                      <div className="purchase-history">
                                        <table className="purchase-history-table">
                                          <thead>
                                            <tr>
                                              <th>{t('inventory.purchaseDate')}</th>
                                              <th>{t('inventory.purchaseUnits')}</th>
                                              <th>{t('inventory.purchaseUnitPrice')}</th>
                                              <th>{t('common.status')}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {recent.map((purchase) => (
                                              <tr key={purchase.id}>
                                                <td>
                                                  {purchase.purchaseDate ||
                                                    purchase.deliveryDate ||
                                                    '—'}
                                                </td>
                                                <td>{purchase.units || '—'}</td>
                                                <td>
                                                  {formatUnitPrice(
                                                    getPurchaseUnitPrice(purchase),
                                                  )}
                                                </td>
                                                <td>{purchase.status || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                      )
                    })
                )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Spot Check' ? (
          <SpotCheckPanel
            getEndpoint={getEndpoint}
            searchQuery={tableSearchQuery}
            onSearchQueryChange={setTableSearchQuery}
            isMobileSearchOpen={isMobileSearchOpen}
            onToggleMobileSearch={() =>
              setIsMobileSearchOpen((current) => !current)
            }
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
          />
        ) : activePage === 'Purchases' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('purchases.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Purchases')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('purchases.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div
                className={`page-action-bar ${
                  isMobileSearchOpen ? 'is-search-open' : ''
                }`}
              >
                <input
                  className="search-input"
                  placeholder={t('purchases.search')}
                  type="search"
                  aria-label={t('purchases.search')}
                  value={tableSearchQuery}
                  onChange={(event) => setTableSearchQuery(event.target.value)}
                />
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-search-toggle ${
                    isMobileSearchOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={
                    isMobileSearchOpen
                      ? t('common.hideSearch')
                      : t('common.showSearch')
                  }
                  aria-expanded={isMobileSearchOpen}
                  onClick={() =>
                    setIsMobileSearchOpen((current) => !current)
                  }
                >
                  {isMobileSearchOpen ? (
                    <span aria-hidden="true">✕</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
                <button
                  className={`btn-ghost btn-filter ${
                    isPurchasesFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setPurchasesFilterDraft({
                      locations: [...purchasesFilters.locations],
                      statuses: [...purchasesFilters.statuses],
                      deliveryDateFrom: purchasesFilters.deliveryDateFrom,
                      deliveryDateTo: purchasesFilters.deliveryDateTo,
                    })
                    setIsPurchasesFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {purchasesActiveFilterCount > 0 ? (
                    <span className="filter-badge">
                      {purchasesActiveFilterCount}
                    </span>
                  ) : null}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={openDirectPurchaseWizard}
                  aria-label={t('purchases.addDirect')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  className="btn-primary"
                  onClick={fetchPurchases}
                  type="button"
                  disabled={isPurchasesLoading}
                  aria-label={t('common.refresh')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {purchasesError ? <div className="alert">{purchasesError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('purchases.totalPurchases')}</p>
                <p className="card-value">{purchasesFilteredRows.length}</p>
                <p className="card-meta">{t('purchases.visiblePurchases')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('purchases.pending')}</p>
                <p className="card-value">{pendingPurchasesCount}</p>
                <p className="card-meta">{t('purchases.pendingMeta')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastSync')}</p>
                <p className="card-value">
                  {purchasesLastUpdated ?? t('common.notSyncedYet')}
                </p>
                <p className="card-meta">{t('common.productionDynamoDb')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('purchases.cardTitle')}</h2>
                  <p className="card-subtitle">{t('purchases.cardSubtitle')}</p>
                </div>
              </div>

              {isPurchasesFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          {t('purchases.filterSubtitle')}
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsPurchasesFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.location')}</p>
                          <div className="filter-options">
                            {purchaseLocationOptions.length === 0 ? (
                              <p className="modal-subtitle">
                                {t('common.locationsEmpty')}
                              </p>
                            ) : (
                              purchaseLocationOptions.map((option) => {
                                const isChecked =
                                  purchasesFilterDraft.locations.includes(option)
                                return (
                                  <label className="filter-option" key={option}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(event) => {
                                        setPurchasesFilterDraft((current) => {
                                          if (event.target.checked) {
                                            return {
                                              ...current,
                                              locations: [
                                                ...current.locations,
                                                option,
                                              ],
                                            }
                                          }
                                          return {
                                            ...current,
                                            locations: current.locations.filter(
                                              (value) => value !== option,
                                            ),
                                          }
                                        })
                                      }}
                                    />
                                    <span>{option}</span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {purchaseStatusOptions.map((option) => {
                              const isChecked =
                                purchasesFilterDraft.statuses.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setPurchasesFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [
                                              ...current.statuses,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('purchases.deliveryDateRange')}</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>{t('common.from')}</span>
                              <input
                                type="date"
                                value={purchasesFilterDraft.deliveryDateFrom}
                                onChange={(event) =>
                                  setPurchasesFilterDraft((current) => ({
                                    ...current,
                                    deliveryDateFrom: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>{t('common.to')}</span>
                              <input
                                type="date"
                                value={purchasesFilterDraft.deliveryDateTo}
                                onChange={(event) =>
                                  setPurchasesFilterDraft((current) => ({
                                    ...current,
                                    deliveryDateTo: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          setPurchasesFilterDraft({
                            locations: [],
                            statuses: [],
                            deliveryDateFrom: '',
                            deliveryDateTo: '',
                          })
                        }
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setPurchasesFilters({
                            locations: [...purchasesFilterDraft.locations],
                            statuses: [...purchasesFilterDraft.statuses],
                            deliveryDateFrom:
                              purchasesFilterDraft.deliveryDateFrom,
                            deliveryDateTo: purchasesFilterDraft.deliveryDateTo,
                          })
                          setIsPurchasesFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isPurchasesLoading}>
                <table className="data-table data-table-purchases">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.itemName')}</th>
                      <th scope="col">{t('common.location')}</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            purchasesSortConfig.key === 'date' ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={togglePurchasesSort}
                        >
                          {t('common.date')}
                          <span className="sort-indicator">
                            {purchasesSortConfig.key === 'date'
                              ? purchasesSortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            isWaitingQuickFilterActive ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={isWaitingQuickFilterActive}
                          onClick={toggleWaitingQuickFilter}
                        >
                          {t('common.quickFilterWaiting')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPurchasesLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          {t('purchases.loading')}
                        </td>
                      </tr>
                    ) : purchasesFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          {purchaseRows.length > 0
                            ? t('purchases.emptyFiltered')
                            : t('purchases.empty')}
                        </td>
                      </tr>
                    ) : (
                      applyPurchasesSort(purchasesFilteredRows).map((row) => {
                        const isExpanded = expandedPurchaseIds.has(row.id)
                        return (
                          <Fragment key={row.id}>
                            <tr>
                              <td>
                                <div className="purchase-name-cell">
                                  <span>{row.itemName}</span>
                                  {row.direct ? (
                                    <span className="purchase-direct-tag">
                                      {t('purchases.directTag')}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td>{row.location}</td>
                              <td>
                                <span className={getStatusClassName(row.status)}>
                                  {statusLabel(row.status)}
                                </span>
                              </td>
                              <td>{row.deliveryDate}</td>
                              <td>
                                <div className="action-buttons">
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={
                                      row.status === PURCHASE_WAITING_INVOICE
                                        ? t('common.confirmInvoice')
                                        : t('common.confirmDelivery')
                                    }
                                    onClick={() => confirmPurchaseDelivery(row)}
                                    disabled={row.status === 'Confirmed'}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={t('common.editPurchase')}
                                    onClick={() => openPurchaseEdit(row)}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    onClick={() => togglePurchaseRow(row.id)}
                                    aria-expanded={isExpanded}
                                    aria-label={t('common.toggleDetails')}
                                  >
                                    {isExpanded ? '▾' : '▸'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={5}>
                                  <div className="detail-grid">
                                    <div>
                                      <p className="detail-label">{t('common.purchaseId')}</p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    {row.direct ? null : (
                                      <div>
                                        <p className="detail-label">{t('common.itemId')}</p>
                                        <p className="detail-value">{row.itemId}</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="detail-label">{t('common.vendor')}</p>
                                      <p className="detail-value">{row.vendor}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.units')}</p>
                                      <p className="detail-value">{row.units}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.totalPrice')}</p>
                                      <p className="detail-value">
                                        {row.totalPrice}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.purchaseDate')}</p>
                                      <p className="detail-value">
                                        {row.purchaseDate}
                                      </p>
                                    </div>
                                    {row.direct ? (
                                      <>
                                        <div>
                                          <p className="detail-label">
                                            {t('purchases.directTag')}
                                          </p>
                                          <p className="detail-value">
                                            {t('purchases.directDetail')}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.shouldBeBilled')}
                                          </p>
                                          <p className="detail-value">
                                            {row.billable ? t('common.yes') : t('common.no')}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.priceInclIva')}
                                          </p>
                                          <p className="detail-value">
                                            {formatUnitPrice(row.cost)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.markup')}
                                          </p>
                                          <p className="detail-value">
                                            {formatUnitPrice(row.markup)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.ivaMarkup')}
                                          </p>
                                          <p className="detail-value">
                                            {formatUnitPrice(row.ivaMarkup)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.priceExclIva')}
                                          </p>
                                          <p className="detail-value">
                                            {formatUnitPrice(row.priceExclIva)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.iva')}
                                          </p>
                                          <p className="detail-value">
                                            {formatUnitPrice(row.iva)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="detail-label">
                                            {t('common.note')}
                                          </p>
                                          <p className="detail-value">
                                            {row.note || '—'}
                                          </p>
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Subtractions' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('subtractions.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Subtractions')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('subtractions.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div
                className={`page-action-bar ${
                  isMobileSearchOpen ? 'is-search-open' : ''
                }`}
              >
                <input
                  className="search-input"
                  placeholder={t('subtractions.search')}
                  type="search"
                  aria-label={t('subtractions.search')}
                  value={tableSearchQuery}
                  onChange={(event) => setTableSearchQuery(event.target.value)}
                />
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-search-toggle ${
                    isMobileSearchOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={
                    isMobileSearchOpen
                      ? t('common.hideSearch')
                      : t('common.showSearch')
                  }
                  aria-expanded={isMobileSearchOpen}
                  onClick={() =>
                    setIsMobileSearchOpen((current) => !current)
                  }
                >
                  {isMobileSearchOpen ? (
                    <span aria-hidden="true">✕</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
                <button
                  className={`btn-ghost btn-filter ${
                    isSubtractionsFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setSubtractionsFilterDraft({
                      locations: [...subtractionsFilters.locations],
                      statuses: [...subtractionsFilters.statuses],
                      dateFrom: subtractionsFilters.dateFrom,
                      dateTo: subtractionsFilters.dateTo,
                    })
                    setIsSubtractionsFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {subtractionsActiveFilterCount > 0 ? (
                    <span className="filter-badge">
                      {subtractionsActiveFilterCount}
                    </span>
                  ) : null}
                </button>
                <button
                  className={`btn-ghost btn-filter subtractions-preset-action ${
                    isCurrentMonthQuickFilterActive ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-pressed={isCurrentMonthQuickFilterActive}
                  aria-label={t('common.quickFilterCurrentMonth')}
                  onClick={toggleCurrentMonthQuickFilter}
                >
                  {t('common.quickFilterCurrentMonth')}
                </button>
                <button
                  className={`btn-ghost btn-filter subtractions-preset-action ${
                    isPreviousMonthQuickFilterActive ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-pressed={isPreviousMonthQuickFilterActive}
                  aria-label={t('common.quickFilterPreviousMonth')}
                  onClick={togglePreviousMonthQuickFilter}
                >
                  {t('common.quickFilterPreviousMonth')}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setIsSubtractionsExportOpen(true)}
                  disabled={isSubtractionsExporting}
                  aria-label={t('common.export')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M10 3v8.2l2.4-2.4 1.4 1.4-4.8 4.8-4.8-4.8 1.4-1.4L8 11.2V3h2zm-6 12h12v2H4v-2z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <button
                  className="btn-primary"
                  onClick={fetchSubtractions}
                  type="button"
                  disabled={isSubtractionsLoading}
                  aria-label={t('common.refresh')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {subtractionsError ? (
              <div className="alert">{subtractionsError}</div>
            ) : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('subtractions.totalSubtractions')}</p>
                <p className="card-value">{subtractionsFilteredRows.length}</p>
                <p className="card-meta">{t('subtractions.visibleSubtractions')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('subtractions.pendingBilling')}</p>
                <p className="card-value">{pendingSubtractionsCount}</p>
                <p className="card-meta">{t('subtractions.awaitingBilling')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastSync')}</p>
                <p className="card-value">
                  {subtractionsLastUpdated ?? t('common.notSyncedYet')}
                </p>
                <p className="card-meta">{t('common.productionDynamoDb')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('subtractions.cardTitle')}</h2>
                  <p className="card-subtitle">{t('subtractions.cardSubtitle')}</p>
                </div>
              </div>

              {isSubtractionsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          {t('subtractions.filterSubtitle')}
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsSubtractionsFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.location')}</p>
                          <div className="filter-options">
                            {subtractionLocationOptions.length === 0 ? (
                              <p className="modal-subtitle">
                                {t('common.locationsEmpty')}
                              </p>
                            ) : (
                              subtractionLocationOptions.map((option) => {
                                const isChecked =
                                  subtractionsFilterDraft.locations.includes(
                                    option,
                                  )
                                return (
                                  <label className="filter-option" key={option}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(event) => {
                                        setSubtractionsFilterDraft((current) => {
                                          if (event.target.checked) {
                                            return {
                                              ...current,
                                              locations: [
                                                ...current.locations,
                                                option,
                                              ],
                                            }
                                          }
                                          return {
                                            ...current,
                                            locations: current.locations.filter(
                                              (entry) => entry !== option,
                                            ),
                                          }
                                        })
                                      }}
                                    />
                                    <span>{option}</span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>

                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {subtractionStatusOptions.map((option) => {
                              const isChecked =
                                subtractionsFilterDraft.statuses.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setSubtractionsFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [
                                              ...current.statuses,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (entry) => entry !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        <div className="filter-group">
                          <p className="filter-title">{t('common.dateRange')}</p>
                          <div className="form-grid">
                            <label className="form-field">
                              <span>{t('common.from')}</span>
                              <input
                                type="date"
                                value={subtractionsFilterDraft.dateFrom}
                                onChange={(event) =>
                                  setSubtractionsFilterDraft((current) => ({
                                    ...current,
                                    dateFrom: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>{t('common.to')}</span>
                              <input
                                type="date"
                                value={subtractionsFilterDraft.dateTo}
                                onChange={(event) =>
                                  setSubtractionsFilterDraft((current) => ({
                                    ...current,
                                    dateTo: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => {
                          setSubtractionsFilterDraft({
                            locations: [],
                            statuses: [],
                            dateFrom: '',
                            dateTo: '',
                          })
                        }}
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setSubtractionsFilters({
                            locations: [...subtractionsFilterDraft.locations],
                            statuses: [...subtractionsFilterDraft.statuses],
                            dateFrom: subtractionsFilterDraft.dateFrom,
                            dateTo: subtractionsFilterDraft.dateTo,
                          })
                          setIsSubtractionsFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <ExportScopeModal
                isOpen={isSubtractionsExportOpen}
                isExporting={isSubtractionsExporting}
                onClose={() => setIsSubtractionsExportOpen(false)}
                onSelect={(scope) => {
                  const ids =
                    scope === 'filtered'
                      ? subtractionsFilteredRows
                          .map((row) => row.id)
                          .filter((id) => id && id !== '—')
                      : undefined
                  void exportSubtractions(ids).then((ok) => {
                    if (ok) {
                      setIsSubtractionsExportOpen(false)
                    }
                  })
                }}
              />

              <div className="table-wrapper" aria-busy={isSubtractionsLoading}>
                <table className="data-table data-table-subtractions">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.itemName')}</th>
                      <th scope="col">{t('common.location')}</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            subtractionsSortConfig.key === 'date'
                              ? 'is-active'
                              : ''
                          }`}
                          type="button"
                          onClick={toggleSubtractionsSort}
                        >
                          {t('common.date')}
                          <span className="sort-indicator">
                            {subtractionsSortConfig.key === 'date'
                              ? subtractionsSortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            isCurrentMonthQuickFilterActive ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={isCurrentMonthQuickFilterActive}
                          onClick={toggleCurrentMonthQuickFilter}
                        >
                          {t('common.quickFilterCurrentMonth')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            isPreviousMonthQuickFilterActive ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={isPreviousMonthQuickFilterActive}
                          onClick={togglePreviousMonthQuickFilter}
                        >
                          {t('common.quickFilterPreviousMonth')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            isPendingBillingQuickFilterActive ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={isPendingBillingQuickFilterActive}
                          onClick={togglePendingBillingQuickFilter}
                        >
                          {t('common.quickFilterBilling')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSubtractionsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={8}>
                          {t('subtractions.loading')}
                        </td>
                      </tr>
                    ) : subtractionsFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={8}>
                          {t('subtractions.empty')}
                        </td>
                      </tr>
                    ) : (
                      applySubtractionsSort(subtractionsFilteredRows).map((row) => {
                        const isExpanded = expandedSubtractionIds.has(row.id)
                        return (
                          <Fragment key={row.id}>
                            <tr>
                              <td>{row.itemName}</td>
                              <td>{row.location}</td>
                              <td>
                                <span className={getStatusClassName(row.status)}>
                                  {statusLabel(row.status)}
                                </span>
                              </td>
                              <td>{row.date}</td>
                              <td>
                                <div className="action-buttons">
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={t('common.markBilled')}
                                    title="Mark billed"
                                    onClick={() => markSubtractionBilled(row)}
                                    disabled={row.status !== 'Pending Billing'}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={t('common.reverseSubtraction')}
                                    title="Reverse"
                                    onClick={() => reverseSubtraction(row)}
                                    disabled={row.status === 'Reversed'}
                                  >
                                    ↺
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    onClick={() => toggleSubtractionRow(row.id)}
                                    aria-expanded={isExpanded}
                                    aria-label={t('common.toggleDetails')}
                                  >
                                    {isExpanded ? '▾' : '▸'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={5}>
                                  <div className="detail-grid">
                                    <div>
                                      <p className="detail-label">
                                        {t('subtractions.subtractionId')}
                                      </p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('common.inventoryLocation')}
                                      </p>
                                      <p className="detail-value">
                                        {row.inventoryLocation}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.units')}</p>
                                      <p className="detail-value">{row.units}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('common.markup')}
                                      </p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.markup)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('common.ivaMarkup')}
                                      </p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.ivaMarkup)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('common.priceExclIva')}
                                      </p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.priceExclIva)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.iva')}</p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.iva)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('common.totalPrice')}
                                      </p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.totalPrice)}
                                      </p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">{t('common.note')}</p>
                                      <p className="detail-value">
                                        {row.note || '—'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Properties' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('properties.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Properties')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('properties.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div className="page-action-bar">
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-filter ${
                    isPropertiesFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setPropertiesFilterDraft({
                      statuses: [...propertiesFilters.statuses],
                      types: [...propertiesFilters.types],
                      roomTypes: [...propertiesFilters.roomTypes],
                      neighborhoods: [...propertiesFilters.neighborhoods],
                    })
                    setIsPropertiesFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {propertiesActiveFilterCount > 0 ? (
                    <span className="filter-badge">{propertiesActiveFilterCount}</span>
                  ) : null}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void refreshPropertiesDiff()}
                  disabled={isPropertiesLoading}
                >
                  {isPropertiesLoading ? 'Updating...' : 'Update from Guesty'}
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {propertiesError ? <div className="alert">{propertiesError}</div> : null}
            {propertiesSyncMessage ? (
              <div className="properties-note">{propertiesSyncMessage}</div>
            ) : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('properties.activeProperties')}</p>
                <p className="card-value">{activePropertiesCount}</p>
                <p className="card-meta">{t('properties.mtlExcluded')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('properties.filteredProperties')}</p>
                <p className="card-value">{filteredPropertiesCount}</p>
                <p className="card-meta">{t('common.visibleInFilters')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastSync')}</p>
                <p className="card-value">
                  {propertiesLastUpdated ?? t('common.notSyncedYet')}
                </p>
                <p className="card-meta">{t('common.fetchedFromGuesty')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('properties.cardTitle')}</h2>
                  <p className="card-subtitle">{t('properties.cardSubtitle')}</p>
                </div>
              </div>

              {isPropertiesFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          {t('properties.filterSubtitle')}
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsPropertiesFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {propertiesStatusOptions.map((option) => {
                              const isChecked =
                                propertiesFilterDraft.statuses.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setPropertiesFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [...current.statuses, option],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">Type</p>
                          <div className="filter-options">
                            {propertiesTypeOptions.map((option) => {
                              const isChecked =
                                propertiesFilterDraft.types.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setPropertiesFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            types: [...current.types, option],
                                          }
                                        }
                                        return {
                                          ...current,
                                          types: current.types.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">RoomType</p>
                          <div className="filter-options">
                            {propertiesRoomTypeOptions.map((option) => {
                              const isChecked =
                                propertiesFilterDraft.roomTypes.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setPropertiesFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            roomTypes: [...current.roomTypes, option],
                                          }
                                        }
                                        return {
                                          ...current,
                                          roomTypes: current.roomTypes.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">Neighborhood</p>
                          <div className="filter-options">
                            {propertiesNeighborhoodOptions.map((option) => {
                              const isChecked =
                                propertiesFilterDraft.neighborhoods.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setPropertiesFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            neighborhoods: [
                                              ...current.neighborhoods,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          neighborhoods:
                                            current.neighborhoods.filter(
                                              (value) => value !== option,
                                            ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          setPropertiesFilterDraft({
                            statuses: [],
                            types: [],
                            roomTypes: [],
                            neighborhoods: [],
                          })
                        }
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setPropertiesFilters({
                            statuses: [...propertiesFilterDraft.statuses],
                            types: [...propertiesFilterDraft.types],
                            roomTypes: [...propertiesFilterDraft.roomTypes],
                            neighborhoods: [
                              ...propertiesFilterDraft.neighborhoods,
                            ],
                          })
                          setIsPropertiesFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isPropertiesLoading}>
                <table className="data-table data-table-properties">
                  <thead>
                    <tr>
                      <th scope="col">
                        <button
                          className={`btn-sort is-active`}
                          type="button"
                          onClick={() =>
                            setPropertiesSortDirection((current) =>
                              current === 'asc' ? 'desc' : 'asc',
                            )
                          }
                        >
                          {t('properties.nickname')}
                          <span className="sort-indicator">
                            {propertiesSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">{t('common.title')}</th>
                      <th scope="col">{t('common.type')}</th>
                      <th scope="col">{t('common.roomType')}</th>
                      <th scope="col">{t('common.neighborhood')}</th>
                      <th scope="col">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPropertiesLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          {t('properties.loading')}
                        </td>
                      </tr>
                    ) : propertiesFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          {t('properties.empty')}
                        </td>
                      </tr>
                    ) : (
                      sortedPropertiesRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.nickname}</td>
                          <td>{row.title}</td>
                          <td>{row.type}</td>
                          <td>{row.roomType}</td>
                          <td>{row.neighborhood}</td>
                          <td>
                            <span
                              className={`status ${
                                row.active ? 'status-success' : 'status-neutral'
                              }`}
                            >
                              {row.active ? t('common.active') : t('common.inactive')}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Bookings' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('bookings.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Bookings')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('bookings.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div className="page-action-bar">
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-filter ${
                    isBookingsFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setBookingsFilterDraft({
                      statuses: [...bookingsFilters.statuses],
                      checkInFrom: bookingsFilters.checkInFrom,
                      checkInTo: bookingsFilters.checkInTo,
                    })
                    setIsBookingsFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {bookingsActiveFilterCount > 0 ? (
                    <span className="filter-badge">{bookingsActiveFilterCount}</span>
                  ) : null}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => void fetchBookings(bookingsCurrentCursor)}
                  disabled={isBookingsLoading || isBookingsSyncing}
                >
                  Refresh
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void refreshBookingsFromGuesty()}
                  disabled={isBookingsLoading || isBookingsSyncing}
                >
                  {isBookingsSyncing
                    ? t('bookings.updatingFromGuesty')
                    : t('bookings.updateFromGuesty')}
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {bookingsError ? <div className="alert">{bookingsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('bookings.visibleBookings')}</p>
                <p className="card-value">{sortedBookingsRows.length}</p>
                <p className="card-meta">{t('common.rowsInCurrentPage')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.pageSize')}</p>
                <p className="card-value">{bookingsPageSize}</p>
                <p className="card-meta">{t('bookings.serverPageSize')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastRefresh')}</p>
                <p className="card-value">{bookingsLastUpdated ?? 'Not refreshed yet'}</p>
                <p className="card-meta">{t('common.fetchedFromDynamoDb')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('bookings.cardTitle')}</h2>
                  <p className="card-subtitle">{t('bookings.cardSubtitle')}</p>
                </div>
                <div className="table-actions">
                  <label className="form-field">
                    <span>{t('common.rowsPerPage')}</span>
                    <select
                      className="select-input"
                      value={bookingsPageSize}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        setBookingsPageSize(value)
                        setBookingsCurrentCursor(null)
                        setBookingsCursorHistory([])
                        setBookingsNextCursor(null)
                      }}
                    >
                      {[25, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {isBookingsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Filter bookings by status and check-in date range.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsBookingsFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {bookingsStatusOptions.map((option) => {
                              const isChecked = bookingsFilterDraft.statuses.some(
                                (status) =>
                                  status.toLowerCase() === option.toLowerCase(),
                              )
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setBookingsFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [...current.statuses, option],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('bookings.checkInRange')}</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>{t('common.from')}</span>
                              <input
                                type="date"
                                value={bookingsFilterDraft.checkInFrom}
                                onChange={(event) =>
                                  setBookingsFilterDraft((current) => ({
                                    ...current,
                                    checkInFrom: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>{t('common.to')}</span>
                              <input
                                type="date"
                                value={bookingsFilterDraft.checkInTo}
                                onChange={(event) =>
                                  setBookingsFilterDraft((current) => ({
                                    ...current,
                                    checkInTo: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => setBookingsFilterDraft(defaultBookingsFilters())}
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setBookingsFilters({
                            statuses: [...bookingsFilterDraft.statuses],
                            checkInFrom: bookingsFilterDraft.checkInFrom,
                            checkInTo: bookingsFilterDraft.checkInTo,
                          })
                          setBookingsCurrentCursor(null)
                          setBookingsCursorHistory([])
                          setBookingsNextCursor(null)
                          setIsBookingsFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isBookingsLoading}>
                <table className="data-table data-table-bookings">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.booking')}</th>
                      <th scope="col">{t('common.guest')}</th>
                      <th scope="col">{t('common.property')}</th>
                      <th scope="col">
                        <button
                          className="btn-sort is-active"
                          type="button"
                          onClick={() =>
                            setBookingsSortDirection((current) =>
                              current === 'asc' ? 'desc' : 'asc',
                            )
                          }
                        >
                          {t('common.checkIn')}
                          <span className="sort-indicator">
                            {bookingsSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">{t('common.checkOut')}</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">{t('common.source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isBookingsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={7}>
                          {t('bookings.loading')}
                        </td>
                      </tr>
                    ) : sortedBookingsRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={7}>
                          {t('bookings.emptyPage')}
                        </td>
                      </tr>
                    ) : (
                      sortedBookingsRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.id}</td>
                          <td>{row.guestName}</td>
                          <td>{row.property}</td>
                          <td>{row.checkIn}</td>
                          <td>{row.checkOut}</td>
                          <td>
                            <span className="status status-neutral">{row.status}</span>
                          </td>
                          <td>{row.source}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    const history = [...bookingsCursorHistory]
                    const previousCursor = history.pop() ?? null
                    setBookingsCursorHistory(history)
                    setBookingsCurrentCursor(previousCursor)
                  }}
                  disabled={isBookingsLoading || bookingsCursorHistory.length === 0}
                >
                  {t('common.previous')}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    if (!bookingsNextCursor) {
                      return
                    }
                    setBookingsCursorHistory((current) => [
                      ...current,
                      bookingsCurrentCursor,
                    ])
                    setBookingsCurrentCursor(bookingsNextCursor)
                  }}
                  disabled={isBookingsLoading || !bookingsNextCursor}
                >
                  {t('common.next')}
                </button>
              </div>
            </section>
          </>
        ) : activePage === 'Reviews' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('reviews.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Reviews')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('reviews.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div className="page-action-bar">
                <div className="header-actions">
                <button
                  className={`btn-icon btn-icon-ghost btn-filter reviews-preset-action ${
                    reviewsCreatedPreset === 'last7' ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('reviews.showLast7')}
                  title={t('reviews.ratingLast7')}
                  onClick={() =>
                    setReviewsCreatedPreset((current) =>
                      current === 'last7' ? 'none' : 'last7',
                    )
                  }
                >
                  {t('common.quickFilterLast7')}
                </button>
                <button
                  className={`btn-icon btn-icon-ghost btn-filter reviews-preset-action ${
                    reviewsCreatedPreset === 'last30' ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('reviews.showLast30')}
                  title={t('reviews.ratingLast30')}
                  onClick={() =>
                    setReviewsCreatedPreset((current) =>
                      current === 'last30' ? 'none' : 'last30',
                    )
                  }
                >
                  {t('common.quickFilterLast30')}
                </button>
                <button
                  className={`btn-ghost btn-filter ${
                    isReviewsFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setReviewsFilterDraft({
                      minRating: reviewsFilters.minRating,
                      maxRating: reviewsFilters.maxRating,
                      createdFrom: reviewsFilters.createdFrom,
                      createdTo: reviewsFilters.createdTo,
                      listingNickname: reviewsFilters.listingNickname,
                    })
                    setIsReviewsFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {reviewsActiveFilterCount > 0 ? (
                    <span className="filter-badge">{reviewsActiveFilterCount}</span>
                  ) : null}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void refreshReviews()}
                  disabled={isReviewsLoading || isReviewsSyncing}
                  aria-label={t('common.refresh')}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {reviewsError ? <div className="alert">{reviewsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('reviews.totalReviews')}</p>
                <p className="card-value">{sortedReviewsRows.length}</p>
                <p className="card-meta">{t('common.totalShownFilters')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('reviews.pendingUnder5')}</p>
                <p className="card-value">{reviewsPendingUnderFiveCount}</p>
                <p className="card-meta">{t('reviews.statusPendingUnder5Meta')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastSync')}</p>
                <p className="card-value">
                  {reviewsLastSyncAt ?? 'No sync recorded yet'}
                </p>
                <p className="card-meta">
                  Last successful reviews sync from sync-state table
                </p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('reviews.cardTitle')}</h2>
                  <p className="card-subtitle">{t('reviews.cardSubtitle')}</p>
                </div>
              </div>

              {isReviewsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Filter by property, rating range, and created-at date.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsReviewsFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">Property</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>{t('reviews.listingNickname')}</span>
                              <select
                                value={reviewsFilterDraft.listingNickname}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    listingNickname: event.target.value,
                                  }))
                                }
                              >
                                <option value="">{t('common.allProperties')}</option>
                                {reviewsPropertyOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">Rating</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>{t('reviews.minRating')}</span>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                step="0.1"
                                value={reviewsFilterDraft.minRating}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    minRating: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>{t('reviews.maxRating')}</span>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                step="0.1"
                                value={reviewsFilterDraft.maxRating}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    maxRating: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">Created at</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>{t('common.from')}</span>
                              <input
                                type="date"
                                value={reviewsFilterDraft.createdFrom}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    createdFrom: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>{t('common.to')}</span>
                              <input
                                type="date"
                                value={reviewsFilterDraft.createdTo}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    createdTo: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          setReviewsFilterDraft({
                            minRating: '',
                            maxRating: '',
                            createdFrom: '',
                            createdTo: '',
                            listingNickname: '',
                          })
                        }
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setReviewsFilters({
                            minRating: reviewsFilterDraft.minRating,
                            maxRating: reviewsFilterDraft.maxRating,
                            createdFrom: reviewsFilterDraft.createdFrom,
                            createdTo: reviewsFilterDraft.createdTo,
                            listingNickname: reviewsFilterDraft.listingNickname,
                          })
                          setReviewsCreatedPreset('none')
                          setIsReviewsFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isReviewsLoading}>
                <table className="data-table data-table-reviews">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.guest')}</th>
                      <th scope="col">{t('common.listing')}</th>
                      <th scope="col">{t('common.rating')}</th>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            reviewsSortDirection ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() =>
                            setReviewsSortDirection((current) =>
                              current === 'asc' ? 'desc' : 'asc',
                            )
                          }
                        >
                          {t('common.date')}
                          <span className="sort-indicator">
                            {reviewsSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            reviewsCreatedPreset === 'last7' ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={reviewsCreatedPreset === 'last7'}
                          aria-label={t('reviews.showLast7')}
                          onClick={() =>
                            setReviewsCreatedPreset((current) =>
                              current === 'last7' ? 'none' : 'last7',
                            )
                          }
                        >
                          {t('common.quickFilterLast7')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col" className="mobile-quick-filter-col">
                        <button
                          className={`btn-quick-filter ${
                            reviewsCreatedPreset === 'last30' ? 'is-active' : ''
                          }`}
                          type="button"
                          aria-pressed={reviewsCreatedPreset === 'last30'}
                          aria-label={t('reviews.showLast30')}
                          onClick={() =>
                            setReviewsCreatedPreset((current) =>
                              current === 'last30' ? 'none' : 'last30',
                            )
                          }
                        >
                          {t('common.quickFilterLast30')}
                          <span
                            className="quick-filter-indicator"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">{t('common.details')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isReviewsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={8}>
                          {t('reviews.loading')}
                        </td>
                      </tr>
                    ) : sortedReviewsRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={8}>
                          {t('reviews.empty')}
                        </td>
                      </tr>
                    ) : (
                      sortedReviewsRows.map((row, index) => {
                        const rowId = `${row.reviewId}-${index}`
                        const isExpanded = expandedReviewIds.has(rowId)
                        const bookingNightRate = row.guestPaidDay
                        const propertyNightRate = row.propertyGuestPaidDayAverage
                        const rateDiffPct =
                          bookingNightRate > 0 && propertyNightRate > 0
                            ? ((bookingNightRate - propertyNightRate) /
                                propertyNightRate) *
                              100
                            : null
                        const rateDiffClassName =
                          rateDiffPct === null
                            ? ''
                            : rateDiffPct < 0
                              ? 'reviews-rate-diff is-below-average'
                              : rateDiffPct > 0
                                ? 'reviews-rate-diff is-above-average'
                                : 'reviews-rate-diff is-neutral-diff'
                        const rateDiffLabel =
                          rateDiffPct === null
                            ? '—'
                            : `${rateDiffPct > 0 ? '+' : ''}${rateDiffPct.toFixed(2)}%`
                        return (
                          <Fragment key={rowId}>
                            <tr>
                              <td>{row.guestName}</td>
                              <td>{row.listingNickname}</td>
                              <td>{row.rating || '—'}</td>
                              <td>{row.createdAt}</td>
                              <td>
                                <span className="status status-neutral">{row.status}</span>
                              </td>
                              <td>
                                <button
                                  className="btn-link"
                                  type="button"
                                  onClick={() =>
                                    setExpandedReviewIds((current) => {
                                      const next = new Set(current)
                                      if (next.has(rowId)) {
                                        next.delete(rowId)
                                      } else {
                                        next.add(rowId)
                                      }
                                      return next
                                    })
                                  }
                                >
                                  {isExpanded ? 'Hide' : 'View'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={6}>
                                  <div className="detail-grid">
                                    <div className="detail-span">
                                      <p className="detail-label">{t('reviews.informativeSection')}</p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">{t('reviews.privateNote')}</p>
                                      <p className="detail-value">{row.privateReview}</p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">{t('reviews.publicReview')}</p>
                                      <p className="detail-value">{row.publicReview}</p>
                                    </div>
                                    <div className="detail-span">
                                      <details>
                                        <summary className="btn-link">
                                          Review breakdown
                                        </summary>
                                        <div className="rules-grid">
                                          <div className="rule-card">
                                            <p className="rule-title">{t('reviews.accuracy')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.accuracy || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">{t('common.checkIn')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.checkIn || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">{t('reviews.cleanliness')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.cleanliness || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">{t('reviews.communication')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.communication || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">{t('common.location')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.location || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">{t('reviews.value')}</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.value || '—'}
                                            </p>
                                          </div>
                                        </div>
                                      </details>
                                    </div>
                                    <div className="detail-span">
                                      <details>
                                        <summary className="btn-link">Value</summary>
                                        <div className="review-value-details">
                                          <div>
                                            <p className="detail-label">{t('reviews.totalGuestPayment')}</p>
                                            <p className="detail-value">
                                              {row.guestPaidTotal
                                                ? `${row.guestPaidTotal} €`
                                                : '—'}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="detail-label">
                                              Guest paid total (without cleaning)
                                            </p>
                                            <p className="detail-value">
                                              {row.guestPaidTotalWithoutCleaning
                                                ? `${row.guestPaidTotalWithoutCleaning} €`
                                                : '—'}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="detail-label">
                                              Night rate difference (%)
                                            </p>
                                            <p
                                              className={`detail-value ${rateDiffClassName}`}
                                            >
                                              {rateDiffLabel}
                                            </p>
                                          </div>
                                        </div>
                                      </details>
                                    </div>
                                    <div className="detail-span review-workflow-slot">
                                      <p className="detail-label">{t('reviews.workflowSection')}</p>
                                      <ReviewWorkflowPanel
                                        row={{
                                          reviewId: row.reviewId,
                                          rating: row.rating,
                                          guestPaidDay: row.guestPaidDay,
                                          status: row.status,
                                          workflowStep: row.workflowStep,
                                          workflowStepIndex: row.workflowStepIndex,
                                          removalStrategy: row.removalStrategy,
                                          compensation: row.compensation,
                                          reviewDeleted: row.reviewDeleted,
                                          lowRatingReason: row.lowRatingReason,
                                        }}
                                        isSaving={reviewWorkflowSavingId === row.reviewId}
                                        onPersist={(payload) =>
                                          persistReviewWorkflow(row.reviewId, payload)
                                        }
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Alerts' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('alerts.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">
                    {pageLabel('Alerts')}
                  </h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen
                        ? t('common.hideSummaryInfo')
                        : t('common.showSummaryInfo')
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">{t('alerts.subtitle')}</p>
              </div>
              <MobileBodyPortal>
              <div
                className={`page-action-bar ${
                  isMobileSearchOpen ? 'is-search-open' : ''
                }`}
              >
                <input
                  className="search-input"
                  placeholder={t('alerts.search')}
                  type="search"
                  aria-label={t('alerts.search')}
                  value={tableSearchQuery}
                  onChange={(event) => setTableSearchQuery(event.target.value)}
                />
                <div className="header-actions">
                <button
                  className={`btn-ghost btn-search-toggle ${
                    isMobileSearchOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={
                    isMobileSearchOpen
                      ? t('common.hideSearch')
                      : t('common.showSearch')
                  }
                  aria-expanded={isMobileSearchOpen}
                  onClick={() =>
                    setIsMobileSearchOpen((current) => !current)
                  }
                >
                  {isMobileSearchOpen ? (
                    <span aria-hidden="true">✕</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
                <button
                  className={`btn-ghost btn-filter ${
                    isAlertsFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setAlertsFilterDraft({
                      statuses: [...alertsFilters.statuses],
                      origins: [...alertsFilters.origins],
                    })
                    setIsAlertsFilterOpen(true)
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                      fill="currentColor"
                    />
                  </svg>
                  {alertsFilters.statuses.length + alertsFilters.origins.length >
                  0 ? (
                    <span className="filter-badge">
                      {alertsFilters.statuses.length +
                        alertsFilters.origins.length}
                    </span>
                  ) : null}
                </button>
                <button className="btn-ghost" type="button" onClick={fetchAlerts}>
                  Refresh
                </button>
                </div>
              </div>
              </MobileBodyPortal>
            </header>

            {alertsError ? <div className="alert">{alertsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">{t('alerts.totalAlerts')}</p>
                <p className="card-value">{alertRows.length}</p>
                <p className="card-meta">{t('common.allOrigins')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.pending')}</p>
                <p className="card-value">{pendingAlertsCount}</p>
                <p className="card-meta">{t('common.needsAction')}</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">{t('common.lastSync')}</p>
                <p className="card-value">
                  {alertsLastUpdated ?? t('common.notSyncedYet')}
                </p>
                <p className="card-meta">{t('common.productionDynamoDb')}</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('alerts.cardTitle')}</h2>
                  <p className="card-subtitle">{t('alerts.cardSubtitle')}</p>
                </div>
              </div>

              {isAlertsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          {t('alerts.filterSubtitle')}
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsAlertsFilterOpen(false)}
                        aria-label={t('common.closeFilters')}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">{t('common.origin')}</p>
                          <div className="filter-options">
                            {alertsOriginOptions.map((option) => {
                              const isChecked =
                                alertsFilterDraft.origins.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setAlertsFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            origins: [
                                              ...current.origins,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          origins: current.origins.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="filter-group">
                          <p className="filter-title">{t('common.status')}</p>
                          <div className="filter-options">
                            {alertsStatusOptions.map((option) => {
                              const isChecked =
                                alertsFilterDraft.statuses.includes(option)
                              return (
                                <label className="filter-option" key={option}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(event) => {
                                      setAlertsFilterDraft((current) => {
                                        if (event.target.checked) {
                                          return {
                                            ...current,
                                            statuses: [
                                              ...current.statuses,
                                              option,
                                            ],
                                          }
                                        }
                                        return {
                                          ...current,
                                          statuses: current.statuses.filter(
                                            (value) => value !== option,
                                          ),
                                        }
                                      })
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          setAlertsFilterDraft({ origins: [], statuses: [] })
                        }
                      >
                        {t('common.clear')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => {
                          setAlertsFilters({
                            origins: [...alertsFilterDraft.origins],
                            statuses: [...alertsFilterDraft.statuses],
                          })
                          setIsAlertsFilterOpen(false)
                        }}
                      >
                        {t('common.applyFilters')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isAlertsLoading}>
                <table className="data-table data-table-alerts">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.name')}</th>
                      <th scope="col">{t('common.description')}</th>
                      <th scope="col">{t('common.date')}</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isAlertsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          {t('alerts.loading')}
                        </td>
                      </tr>
                    ) : alertsFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          {t('alerts.empty')}
                        </td>
                      </tr>
                    ) : (
                      alertsFilteredRows.map((row) => {
                        const isExpanded = expandedAlertIds.has(row.id)
                        return (
                          <Fragment key={row.id}>
                            <tr>
                              <td>{row.name}</td>
                              <td>{row.description}</td>
                              <td>{row.date}</td>
                              <td>
                                <span className={getStatusClassName(row.status)}>
                                  {statusLabel(row.status)}
                                </span>
                              </td>
                              <td>
                                <div className="action-buttons">
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={t('common.markDone')}
                                    onClick={() =>
                                      updateAlertStatus(row.id, 'Done')
                                    }
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label={t('alerts.snoozeTitle')}
                                    onClick={() => openSnoozeModal(row.id)}
                                  >
                                    ⏲
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    onClick={() => toggleAlertRow(row.id)}
                                    aria-expanded={isExpanded}
                                    aria-label={t('common.toggleDetails')}
                                  >
                                    {isExpanded ? '▾' : '▸'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={5}>
                                  <div className="detail-grid">
                                    <div>
                                      <p className="detail-label">{t('common.alertId')}</p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.origin')}</p>
                                      <p className="detail-value">{row.origin}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.createdBy')}</p>
                                      <p className="detail-value">
                                        {row.createdBy}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : activePage === 'Daily Operations' ? (
          <DailyOperationsView
            mode="dashboard"
            getEndpoint={getEndpoint}
            getCurrentUserEmail={getCurrentUserEmail}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Unassigned tasks' ? (
          <DailyOperationsView
            mode="unassigned"
            getEndpoint={getEndpoint}
            getCurrentUserEmail={getCurrentUserEmail}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Visit templates' ? (
          <DailyOperationsView
            mode="templates"
            getEndpoint={getEndpoint}
            getCurrentUserEmail={getCurrentUserEmail}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Cleaning Plan' ? (
          <CleaningPlanView
            getEndpoint={getEndpoint}
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Cleaning Incidents' ? (
          <CleaningIncidentsView
            getEndpoint={getEndpoint}
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
            searchQuery={tableSearchQuery}
            onSearchQueryChange={setTableSearchQuery}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Cleaning Billing' ? (
          <CleaningBillingView
            getEndpoint={getEndpoint}
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Cleaning settings' ? (
          <CleaningSettingsView
            getEndpoint={getEndpoint}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Maintenance Incidents' ? (
          <MaintenanceIncidentsView
            getEndpoint={getEndpoint}
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
            searchQuery={tableSearchQuery}
            onSearchQueryChange={setTableSearchQuery}
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Maintenance Billing' ? (
          <MaintenanceBillingView
            getEndpoint={getEndpoint}
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
            propertyOptions={activeManagedPropertyOptions}
          />
        ) : activePage === 'Maintenance settings' ? (
          <MaintenanceSettingsView getEndpoint={getEndpoint} />
        ) : activePage === 'Logs' ? (
          <LogsPanel
            getEndpoint={getEndpoint}
            searchQuery={tableSearchQuery}
            onSearchQueryChange={setTableSearchQuery}
            isMobileSearchOpen={isMobileSearchOpen}
            onToggleMobileSearch={() =>
              setIsMobileSearchOpen((current) => !current)
            }
            isSummaryInfoOpen={isSummaryInfoOpen}
            onToggleSummaryInfo={() =>
              setIsSummaryInfoOpen((current) => !current)
            }
          />
        ) : activePage === 'Chatbot' ? (
          <ChatbotView />
        ) : (
          <section className="card">
            <h1 className="page-title">
              {pageLabel(activePage)}
            </h1>
            <p className="subtitle">
              {t('common.comingSoon')}
            </p>
          </section>
        )}

        {isPropertiesDiffOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal properties-diff-modal">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{t('properties.changesTitle')}</h3>
                  <p className="modal-subtitle">{t('properties.changesSubtitle')}</p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setIsPropertiesDiffOpen(false)}
                  aria-label={t('common.closePropertyChanges')}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="properties-diff-list">
                  {propertyDiffs.map((diff) => {
                    const isChecked = selectedPropertyDiffIds.has(diff.id)
                    return (
                      <label className="properties-diff-item" key={diff.id}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            setSelectedPropertyDiffIds((current) => {
                              const next = new Set(current)
                              if (event.target.checked) {
                                next.add(diff.id)
                              } else {
                                next.delete(diff.id)
                              }
                              return next
                            })
                          }}
                        />
                        <div className="properties-diff-content">
                          <p className="properties-diff-title">
                            {diff.action === 'add'
                              ? t('properties.diffAdd')
                              : diff.action === 'update'
                                ? t('properties.diffDeactivate')
                                : t('properties.diffRemove')}{' '}
                            {diff.row.nickname} ({diff.row.id})
                          </p>
                          <p className="properties-diff-meta">
                            {diff.row.title} - {diff.row.city} -{' '}
                            {diff.row.active ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsPropertiesDiffOpen(false)}
                  disabled={isApplyingPropertyChanges}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void applyPropertyDiffSelection()}
                  disabled={isApplyingPropertyChanges}
                >
                  {isApplyingPropertyChanges ? 'Applying...' : 'Apply selected'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isFormOpen ? (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={closeForm}
          >
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{t('inventory.formTitle')}</h3>
                  <p className="modal-subtitle">{t('inventory.formSubtitle')}</p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={closeForm}
                  aria-label={t('common.closeForm')}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <p className="modal-subtitle">
                  {formStep === 'details'
                    ? t('common.stepOf', { current: 1, total: 2 })
                    : t('common.stepOf', { current: 2, total: 2 })}
                </p>
                {formStep === 'details' ? (
                  <div className="form-grid">
                    <label className="form-field">
                      <span>{t('common.itemName')}</span>
                      <input
                        type="text"
                        value={formValues.name}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder={t('inventory.namePlaceholder')}
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.itemNameEs')}</span>
                      <input
                        type="text"
                        value={formValues.nameEs}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            nameEs: event.target.value,
                          }))
                        }
                        placeholder={t('inventory.nameEsPlaceholder')}
                      />
                      <p className="form-field-hint">{t('inventory.nameEsHint')}</p>
                    </label>
                    <label className="form-field">
                      <span>{t('common.category')}</span>
                      <select
                        value={formValues.categoryChoice}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            categoryChoice: event.target.value,
                            categoryOther:
                              event.target.value === OTHER_OPTION
                                ? current.categoryOther
                                : '',
                          }))
                        }
                      >
                        <option value="">{t('common.select')}</option>
                        {categoryOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                        <option value={OTHER_OPTION}>{t('common.other')}</option>
                      </select>
                    </label>
                    {formValues.categoryChoice === OTHER_OPTION ? (
                      <label className="form-field">
                        <span>{t('common.customCategory')}</span>
                        <input
                          type="text"
                          value={formValues.categoryOther}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              categoryOther: event.target.value,
                            }))
                          }
                          placeholder={t('inventory.categoryPlaceholder')}
                        />
                      </label>
                    ) : null}
                    <label className="form-field">
                      <span>{t('common.location')}</span>
                      <select
                        value={formValues.locationChoice}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            locationChoice: event.target.value,
                            locationOther:
                              event.target.value === OTHER_OPTION
                                ? current.locationOther
                                : '',
                          }))
                        }
                      >
                        <option value="">{t('common.select')}</option>
                        {locationOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                        <option value={OTHER_OPTION}>{t('common.other')}</option>
                      </select>
                    </label>
                    {formValues.locationChoice === OTHER_OPTION ? (
                      <label className="form-field">
                        <span>{t('common.customLocation')}</span>
                        <input
                          type="text"
                          value={formValues.locationOther}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              locationOther: event.target.value,
                            }))
                          }
                          placeholder={t('inventory.locationPlaceholder')}
                        />
                      </label>
                    ) : null}
                    <label className="form-field">
                      <span>{t('common.quantity')}</span>
                      <input
                        type="number"
                        min="0"
                        value={formValues.quantity}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            quantity: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="form-grid">
                    <label className="form-field">
                      <span>{t('common.rebuyQty')}</span>
                      <input
                        type="number"
                        min="0"
                        value={formValues.rebuyQty}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            rebuyQty: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.unitPrice')}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formValues.unitPrice}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            unitPrice: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.tolerance')}</span>
                      <input
                        type="number"
                        min="0"
                        value={formValues.tolerance}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            tolerance: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                  </div>
                )}
                {formError ? <div className="alert">{formError}</div> : null}
              </div>

              <div className="modal-footer">
                {formStep === 'details' ? (
                  <>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={closeForm}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={goToRestockStep}
                    >
                      {t('common.next')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => setFormStep('details')}
                      disabled={isSaving}
                    >
                      {t('common.back')}
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={saveItem}
                      disabled={isSaving}
                    >
                      {isSaving ? t('common.saving') : t('common.saveItem')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isPurchaseFormOpen ? (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={closePurchaseForm}
          >
            <div className="modal modal-scrollable" onClick={(event) => event.stopPropagation()}>
              {(() => {
                const isEditingPurchase = Boolean(purchaseFormValues.id)
                const isDirectPurchase = purchaseFormValues.direct
                return (
                  <div className="modal-header">
                    <div>
                      <h3 className="modal-title">
                        {isDirectPurchase
                          ? isEditingPurchase
                            ? t('purchases.formTitleDirectEdit')
                            : t('purchases.formTitleDirect')
                          : isEditingPurchase
                            ? t('purchases.formTitleShort')
                            : t('purchases.formTitleNew')}
                      </h3>
                      {isDirectPurchase ? (
                        <p className="modal-subtitle">
                          {t('purchases.formSubtitleDirect')}
                        </p>
                      ) : isEditingPurchase ? (
                        <p className="modal-subtitle">
                          {t('purchases.formSubtitleEdit')}
                        </p>
                      ) : (
                        <p className="modal-subtitle">
                          Registering a new{' '}
                          <strong>{purchaseFormValues.itemName}</strong> purchase
                          in <strong>{purchaseFormValues.location}</strong>.
                        </p>
                      )}
                    </div>
                    <button
                      className="btn-icon"
                      type="button"
                      onClick={closePurchaseForm}
                      aria-label={t('common.closePurchaseForm')}
                    >
                      ✕
                    </button>
                  </div>
                )
              })()}
              <div className="modal-body">
                {purchaseFormValues.direct ? (
                  <>
                    <div className="form-grid">
                      <label className="form-field form-field-span">
                        <span>{t('common.itemName')}</span>
                        <input
                          type="text"
                          value={purchaseFormValues.itemName}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              itemName: event.target.value,
                            }))
                          }
                          placeholder={t('common.itemName')}
                        />
                      </label>
                      <label className="form-field">
                        <span>{t('common.vendor')}</span>
                        <input
                          type="text"
                          value={purchaseFormValues.vendor}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              vendor: event.target.value,
                            }))
                          }
                          placeholder={t('common.vendorName')}
                        />
                      </label>
                      <label className="form-field">
                        <span>{t('common.units')}</span>
                        <input
                          type="number"
                          min="1"
                          value={purchaseFormValues.units}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              units: event.target.value,
                            }))
                          }
                          placeholder="1"
                        />
                      </label>
                      <label className="form-field">
                        <span>{t('common.receivingProperty')}</span>
                        <select
                          value={purchaseFormValues.propertyId}
                          onChange={(event) => {
                            const selectedId = event.target.value
                            const selectedProperty = activePropertyOptions.find(
                              (property) => property.id === selectedId,
                            )
                            setPurchaseFormValues((current) => ({
                              ...current,
                              propertyId: selectedId,
                              location: selectedProperty?.nickname ?? '',
                            }))
                          }}
                        >
                          <option value="">{t('common.selectProperty')}</option>
                          {activePropertyOptions.map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.nickname}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>{t('common.priceInclIva')}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={purchaseFormValues.cost}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              cost: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </label>
                      <div className="form-field-span subtraction-checkboxes">
                        <label className="form-field-checkbox">
                          <input
                            type="checkbox"
                            checked={purchaseFormValues.billable}
                            onChange={(event) =>
                              setPurchaseFormValues((current) => ({
                                ...current,
                                billable: event.target.checked,
                              }))
                            }
                          />
                          <span>{t('common.shouldBeBilled')}</span>
                        </label>
                        <label className="form-field-checkbox">
                          <input
                            type="checkbox"
                            checked={purchaseFormValues.markup}
                            onChange={(event) =>
                              setPurchaseFormValues((current) => ({
                                ...current,
                                markup: event.target.checked,
                              }))
                            }
                          />
                          <span>{t('common.markup')}</span>
                        </label>
                      </div>
                      <label className="form-field form-field-span">
                        <span>{t('common.noteOptional')}</span>
                        <textarea
                          value={purchaseFormValues.note}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              note: event.target.value,
                            }))
                          }
                          placeholder={t('common.addNote')}
                          rows={3}
                        />
                      </label>
                      <label className="form-field">
                        <span>{t('common.deliveryDate')}</span>
                        <input
                          type="date"
                          value={purchaseFormValues.deliveryDate}
                          onChange={(event) =>
                            setPurchaseFormValues((current) => ({
                              ...current,
                              deliveryDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    {(() => {
                      const costValue = Number(purchaseFormValues.cost)
                      const pricing = computeSubtractionPricing(
                        Number.isFinite(costValue) ? costValue : 0,
                        purchaseFormValues.markup,
                      )
                      return (
                        <div className="subtraction-pricing-grid">
                          <div className="subtraction-pricing-item">
                            <p className="detail-label">{t('common.markup')}</p>
                            <p className="detail-value">
                              {formatUnitPrice(pricing.markup)}
                            </p>
                          </div>
                          <div className="subtraction-pricing-item">
                            <p className="detail-label">{t('common.ivaMarkup')}</p>
                            <p className="detail-value">
                              {formatUnitPrice(pricing.ivaMarkup)}
                            </p>
                          </div>
                          <div className="subtraction-pricing-item">
                            <p className="detail-label">{t('common.priceExclIva')}</p>
                            <p className="detail-value">
                              {formatUnitPrice(pricing.priceExclIva)}
                            </p>
                          </div>
                          <div className="subtraction-pricing-item">
                            <p className="detail-label">{t('common.iva')}</p>
                            <p className="detail-value">
                              {formatUnitPrice(pricing.iva)}
                            </p>
                          </div>
                          <div className="subtraction-pricing-item">
                            <p className="detail-label">{t('common.totalPrice')}</p>
                            <p className="detail-value">
                              {formatUnitPrice(pricing.totalPrice)}
                            </p>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <div className="form-grid">
                    <label className="form-field">
                      <span>{t('common.vendor')}</span>
                      <input
                        type="text"
                        value={purchaseFormValues.vendor}
                        onChange={(event) =>
                          setPurchaseFormValues((current) => ({
                            ...current,
                            vendor: event.target.value,
                          }))
                        }
                        placeholder={t('common.vendorName')}
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.units')}</span>
                      <input
                        type="number"
                        min="0"
                        value={purchaseFormValues.units}
                        onChange={(event) =>
                          setPurchaseFormValues((current) => ({
                            ...current,
                            units: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.totalPrice')}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={purchaseFormValues.totalPrice}
                        onChange={(event) =>
                          setPurchaseFormValues((current) => ({
                            ...current,
                            totalPrice: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('common.deliveryDate')}</span>
                      <input
                        type="date"
                        value={purchaseFormValues.deliveryDate}
                        onChange={(event) =>
                          setPurchaseFormValues((current) => ({
                            ...current,
                            deliveryDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                )}
                {purchaseFormError ? (
                  <div className="alert">{purchaseFormError}</div>
                ) : null}
              </div>

              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closePurchaseForm}
                  disabled={isPurchaseSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={savePurchase}
                  disabled={isPurchaseSaving}
                >
                  {isPurchaseSaving ? 'Saving...' : 'Save purchase'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isSubtractionFormOpen ? (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={closeSubtractionForm}
          >
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{t('subtractions.formTitle')}</h3>
                  <p className="modal-subtitle">
                    Registering a manual removal of{' '}
                    <strong>{subtractionFormValues.itemName}</strong> from{' '}
                    <strong>
                      {subtractionFormValues.inventoryLocation || 'inventory'}
                    </strong>
                    .
                  </p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={closeSubtractionForm}
                  aria-label={t('common.closeSubtractionForm')}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <label className="form-field">
                    <span>{t('common.units')}</span>
                    <input
                      type="number"
                      min="1"
                      value={subtractionFormValues.units}
                      onChange={(event) =>
                        setSubtractionFormValues((current) => ({
                          ...current,
                          units: event.target.value,
                        }))
                      }
                      placeholder="1"
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('common.receivingProperty')}</span>
                    <select
                      value={subtractionFormValues.propertyId}
                      onChange={(event) => {
                        const selectedId = event.target.value
                        const selectedProperty = activePropertyOptions.find(
                          (property) => property.id === selectedId,
                        )
                        setSubtractionFormValues((current) => ({
                          ...current,
                          propertyId: selectedId,
                          location: selectedProperty?.nickname ?? '',
                        }))
                      }}
                    >
                      <option value="">{t('common.selectProperty')}</option>
                      {activePropertyOptions.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('common.priceInclIva')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={subtractionFormValues.cost}
                      onChange={(event) =>
                        setSubtractionFormValues((current) => ({
                          ...current,
                          cost: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <div className="form-field-span subtraction-checkboxes">
                    <label className="form-field-checkbox">
                      <input
                        type="checkbox"
                        checked={subtractionFormValues.billable}
                        onChange={(event) =>
                          setSubtractionFormValues((current) => ({
                            ...current,
                            billable: event.target.checked,
                          }))
                        }
                      />
                      <span>{t('common.shouldBeBilled')}</span>
                    </label>
                    <label className="form-field-checkbox">
                      <input
                        type="checkbox"
                        checked={subtractionFormValues.markup}
                        onChange={(event) =>
                          setSubtractionFormValues((current) => ({
                            ...current,
                            markup: event.target.checked,
                          }))
                        }
                      />
                      <span>{t('common.markup')}</span>
                    </label>
                  </div>
                  <label className="form-field form-field-span">
                    <span>{t('common.noteOptional')}</span>
                    <textarea
                      value={subtractionFormValues.note}
                      onChange={(event) =>
                        setSubtractionFormValues((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder={t('common.addNote')}
                      rows={3}
                    />
                  </label>
                </div>
                {(() => {
                  const costValue = Number(subtractionFormValues.cost)
                  const pricing = computeSubtractionPricing(
                    Number.isFinite(costValue) ? costValue : 0,
                    subtractionFormValues.markup,
                  )
                  return (
                    <div className="subtraction-pricing-grid">
                      <div className="subtraction-pricing-item">
                        <p className="detail-label">{t('common.markup')}</p>
                        <p className="detail-value">
                          {formatUnitPrice(pricing.markup)}
                        </p>
                      </div>
                      <div className="subtraction-pricing-item">
                        <p className="detail-label">{t('common.ivaMarkup')}</p>
                        <p className="detail-value">
                          {formatUnitPrice(pricing.ivaMarkup)}
                        </p>
                      </div>
                      <div className="subtraction-pricing-item">
                        <p className="detail-label">{t('common.priceExclIva')}</p>
                        <p className="detail-value">
                          {formatUnitPrice(pricing.priceExclIva)}
                        </p>
                      </div>
                      <div className="subtraction-pricing-item">
                        <p className="detail-label">{t('common.iva')}</p>
                        <p className="detail-value">
                          {formatUnitPrice(pricing.iva)}
                        </p>
                      </div>
                      <div className="subtraction-pricing-item">
                        <p className="detail-label">{t('common.totalPrice')}</p>
                        <p className="detail-value">
                          {formatUnitPrice(pricing.totalPrice)}
                        </p>
                      </div>
                    </div>
                  )
                })()}
                {subtractionFormError ? (
                  <div className="alert">{subtractionFormError}</div>
                ) : null}
              </div>

              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closeSubtractionForm}
                  disabled={isSubtractionSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={saveSubtraction}
                  disabled={isSubtractionSaving}
                >
                  {isSubtractionSaving ? 'Saving...' : 'Save subtraction'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isSnoozeOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{t('alerts.snoozeTitle')}</h3>
                  <p className="modal-subtitle">
                    Select the date to be reminded.
                  </p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setIsSnoozeOpen(false)}
                  aria-label={t('common.closeSnooze')}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <label className="form-field">
                  <span>{t('common.reminderDate')}</span>
                  <input
                    type="date"
                    value={snoozeDate}
                    onChange={(event) => setSnoozeDate(event.target.value)}
                  />
                </label>
                {snoozeError ? <div className="alert">{snoozeError}</div> : null}
              </div>
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsSnoozeOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    if (!snoozeDate) {
                      setSnoozeError(t('alerts.selectReminderDate'))
                      return
                    }
                    if (!snoozeTargetId) {
                      setSnoozeError(t('alerts.missingId'))
                      return
                    }
                    const snoozeUntil = formatSnoozeUntil(snoozeDate)
                    if (!snoozeUntil) {
                      setSnoozeError(t('alerts.selectValidDate'))
                      return
                    }
                    void updateAlertStatus(
                      snoozeTargetId,
                      'Snoozed',
                      snoozeUntil,
                    )
                    setIsSnoozeOpen(false)
                  }}
                >
                  Snooze
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
