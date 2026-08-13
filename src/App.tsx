import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'
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
  apartmentAmount: string
  apartmentUnit: string
  hostelAmount: string
  hostelUnit: string
  roomAmount: string
  roomUnit: string
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
  action: 'add' | 'remove'
  row: PropertyRow
}

const navigation = [
  {
    section: 'Ops',
    items: [
      'Inventory',
      'Purchases',
      'Subtractions',
      'Properties',
      'Bookings',
      'Reviews',
      'Cleaning Report',
      'Daily Operations',
    ],
  },
  {
    section: 'Tech',
    items: ['Tech solution 1', 'Tech solution 2', 'Tech solution 3'],
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
const OTHER_OPTION = '__other__'
const REVIEWS_SYNC_TRIGGER_URL =
  import.meta.env.VITE_GUESTY_REVIEWS_SYNC_URL ??
  'https://r3faghrqj3o4x7b4noa53f4gee0pmnpf.lambda-url.eu-central-1.on.aws/'
const PROPERTIES_SYNC_TRIGGER_URL =
  import.meta.env.VITE_GUESTY_PROPERTIES_SYNC_URL ??
  'https://pgkntvnjnvqrlgmeboqebwa33u0ydznp.lambda-url.eu-central-1.on.aws/'

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
  cost: ['Cost', 'cost'],
  billable: ['Billable', 'billable'],
  note: ['Note', 'note'],
  date: ['Date', 'date', 'Substraction date', 'Subtraction date'],
  status: ['Status', 'status'],
}

const propertyFieldMap = {
  id: ['id', 'ID'],
  title: ['title', 'Title'],
  nickname: ['nickname', 'Nickname'],
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
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }
    if (normalized === 'false') {
      return false
    }
  }
  return false
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

const buildRule = (amountValue: string, unitValue: string) => {
  const amount = Number(amountValue)
  const unit = unitValue.trim()
  if (!unit && !amountValue) {
    return null
  }
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    unit: unit || 'n/a',
  }
}

const buildConsumptionRules = (values: InventoryFormState) => {
  const apartment = buildRule(values.apartmentAmount, values.apartmentUnit)
  const hostel = buildRule(values.hostelAmount, values.hostelUnit)
  const room = buildRule(values.roomAmount, values.roomUnit)
  const rules: ConsumptionRules = {}
  if (apartment) {
    rules.apartment = apartment
  }
  if (hostel) {
    rules.hostel = hostel
  }
  if (room) {
    rules.room = room
  }
  return Object.keys(rules).length ? rules : null
}

const getRuleValue = (rule?: ConsumptionRule) => ({
  amount: rule ? String(rule.amount) : '',
  unit: rule?.unit ?? '',
})

const statusRank: Record<string, number> = {
  Reorder: 3,
  'Low Stock': 2,
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
  }
}

const mapSubtractionRow = (item: Record<string, unknown>): SubtractionRow => {
  const dateRaw = getStringValue(getItemValue(item, subtractionFieldMap.date))
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
    cost: getNumberValue(getItemValue(item, subtractionFieldMap.cost)),
    billable: getBooleanValue(getItemValue(item, subtractionFieldMap.billable)),
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

  return {
    id: getStringValue(getItemValue(item, propertyFieldMap.id)) || '—',
    title: getStringValue(getItemValue(item, propertyFieldMap.title)) || '—',
    nickname:
      getStringValue(getItemValue(item, propertyFieldMap.nickname)) || '—',
    active: getBooleanValue(getItemValue(item, propertyFieldMap.active)),
    type: getStringValue(getItemValue(item, propertyFieldMap.type)) || '—',
    roomType: getStringValue(getItemValue(item, propertyFieldMap.roomType)) || '—',
    accommodates: getNumberValue(
      getItemValue(item, propertyFieldMap.accommodates),
    ),
    bedrooms: getNumberValue(getItemValue(item, propertyFieldMap.bedrooms)),
    bathrooms: getNumberValue(getItemValue(item, propertyFieldMap.bathrooms)),
    city: getStringValue(cityValue) || '—',
    neighborhood: getStringValue(neighborhoodValue) || '—',
  }
}

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
    return 'status status-neutral'
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
  apartmentAmount: '',
  apartmentUnit: '',
  hostelAmount: '',
  hostelUnit: '',
  roomAmount: '',
  roomUnit: '',
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
  note: '',
}

function App() {
  const { t, i18n } = useTranslation()
  const pageLabel = (page: string) => translatePage(t, page)
  const sectionLabel = (section: string) => translateSection(t, section)
  const statusLabel = (status: string) => translateStatus(t, status)
  const itemDisplayName = (row: Pick<InventoryRow, 'name' | 'nameEs'>) =>
    displayInventoryName(i18n.language, row.name, row.nameEs)

  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
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
    statuses: ['To be confirmed', 'Waiting Delivery'],
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
    statuses: ['To be confirmed', 'Waiting Delivery'],
    deliveryDateFrom: '',
    deliveryDateTo: '',
  })
  const [subtractionRows, setSubtractionRows] = useState<SubtractionRow[]>([])
  const [isSubtractionsLoading, setIsSubtractionsLoading] = useState(false)
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
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [bookingsLastUpdated, setBookingsLastUpdated] = useState<string | null>(null)
  const [isBookingsFilterOpen, setIsBookingsFilterOpen] = useState(false)
  const [bookingsFilters, setBookingsFilters] = useState<{
    statuses: string[]
    checkInFrom: string
    checkInTo: string
  }>({
    statuses: [],
    checkInFrom: '',
    checkInTo: '',
  })
  const [bookingsFilterDraft, setBookingsFilterDraft] = useState<{
    statuses: string[]
    checkInFrom: string
    checkInTo: string
  }>({
    statuses: [],
    checkInFrom: '',
    checkInTo: '',
  })
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  )
  const [sortConfig, setSortConfig] = useState<{
    key: 'name' | 'status' | null
    direction: 'asc' | 'desc'
  }>({ key: null, direction: 'asc' })
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
      .sort((a, b) => {
        const left = parseDateValue(a.deliveryDateRaw)?.getTime() ?? 0
        const right = parseDateValue(b.deliveryDateRaw)?.getTime() ?? 0
        return right - left
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
    () =>
      purchasesFilteredRows.filter((row) => row.status !== 'Confirmed').length,
    [purchasesFilteredRows],
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
      .filter((row) => row.active)
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
  }, [propertyRows])

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
        if (toDate && rowDate.getTime() > toDate.getTime()) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        const left = parseDateValue(a.dateRaw)?.getTime() ?? 0
        const right = parseDateValue(b.dateRaw)?.getTime() ?? 0
        return right - left
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

  const getEndpoint = (key: string, fallback?: string) => {
    if (fallback) {
      return fallback
    }
    const config = Amplify.getConfig() as { custom?: Record<string, string> }
    const outputCustom = (outputs as { custom?: Record<string, string> }).custom
    return config.custom?.[key] ?? outputCustom?.[key]
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
        const mappedRows = items
          .map((entry) => mapBookingRow(normalizeInventoryItem(entry)))
          .filter((row) => {
            if (bookingsFilters.statuses.length === 0) {
              return true
            }
            return bookingsFilters.statuses.includes(row.status)
          })
        setBookingRows(mappedRows)
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
        fetch(reviewsEndpoint),
        fetch(syncStateEndpoint),
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
      const response = await authFetch(REVIEWS_SYNC_TRIGGER_URL)
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
      const response = await authFetch(PROPERTIES_SYNC_TRIGGER_URL)
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

      const currentById = new Map(propertyRows.map((row) => [row.id, row]))
      const externalById = new Map(externalRows.map((row) => [row.id, row]))
      const nextDiffs: PropertyDiff[] = []

      externalRows.forEach((row) => {
        if (!currentById.has(row.id)) {
          nextDiffs.push({
            id: `add:${row.id}`,
            action: 'add',
            row,
          })
        }
      })

      propertyRows.forEach((row) => {
        if (!externalById.has(row.id)) {
          nextDiffs.push({
            id: `remove:${row.id}`,
            action: 'remove',
            row,
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
      setSelectedPropertyDiffIds(new Set(nextDiffs.map((diff) => diff.id)))
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
        if (diff.action === 'add') {
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
            throw new Error(`Failed to add property ${diff.row.id}.`)
          }
          continue
        }

        const response = await authFetch(deleteEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: diff.row.id }),
        })
        if (!response.ok) {
          throw new Error(`Failed to delete property ${diff.row.id}.`)
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

  const exportInventory = useCallback(async () => {
    const endpoint = getEndpoint(
      'exportInventoryUrl',
      import.meta.env.VITE_EXPORT_INVENTORY_URL,
    )
    if (!endpoint) {
      setError(
        'Missing export endpoint. Set VITE_EXPORT_INVENTORY_URL in the environment.',
      )
      return
    }

    setIsExporting(true)
    setError(null)

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Export request failed (${response.status}). ${errorText}`.trim(),
        )
      }

      const contentDisposition = response.headers.get('content-disposition') || ''
      const match = contentDisposition.match(/filename="([^"]+)"/)
      const fallbackStamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, '')
      const fileName =
        match?.[1] ?? `inventory-export-${fallbackStamp}.xlsx`
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to export inventory. Please try again.'
      setError(message)
    } finally {
      setIsExporting(false)
    }
  }, [])

  const openSnoozeModal = (id: string) => {
    setSnoozeTargetId(id)
    setSnoozeDate('')
    setSnoozeError(null)
    setIsSnoozeOpen(true)
  }

  useEffect(() => {
    if (activePage === 'Inventory') {
      void fetchInventory()
    }
    if (activePage === 'Alerts') {
      void fetchAlerts()
    }
    if (activePage === 'Purchases') {
      void fetchPurchases()
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
    if (activePage === 'Daily Operations') {
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
      note: '',
    })
    setSubtractionFormError(null)
    setIsSubtractionFormOpen(true)
  }

  const openPurchaseEdit = (row: PurchaseRow) => {
    setPurchaseFormValues({
      id: row.id,
      itemId: row.itemId,
      itemName: row.itemName,
      location: row.location,
      vendor: row.vendor === '—' ? '' : row.vendor,
      units: row.units ? String(row.units) : '',
      totalPrice: row.totalPrice ? String(row.totalPrice) : '',
      deliveryDate: formatDateForInput(row.deliveryDateRaw),
      purchaseDate: row.purchaseDateRaw,
      status: row.status || '',
    })
    setPurchaseFormError(null)
    setIsPurchaseFormOpen(true)
  }

  const openEditItem = (row: InventoryRow) => {
    const apartmentRule = getRuleValue(row.consumptionRules?.apartment)
    const hostelRule = getRuleValue(row.consumptionRules?.hostel)
    const roomRule = getRuleValue(row.consumptionRules?.room)
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
      apartmentAmount: apartmentRule.amount,
      apartmentUnit: apartmentRule.unit,
      hostelAmount: hostelRule.amount,
      hostelUnit: hostelRule.unit,
      roomAmount: roomRule.amount,
      roomUnit: roomRule.unit,
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

  const statusOptions = ['OK', 'In Stock', 'Low Stock', 'Reorder']

  const propertiesFilteredRows = useMemo(() => {
    return propertyRows.filter((row) => {
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
    return propertyRows.filter((row) => row.active && row.type !== 'MTL').length
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
    const unique = new Set(bookingRows.map((row) => row.status).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [bookingRows])

  const bookingsActiveFilterCount = useMemo(() => {
    return (
      bookingsFilters.statuses.length +
      (bookingsFilters.checkInFrom ? 1 : 0) +
      (bookingsFilters.checkInTo ? 1 : 0)
    )
  }, [
    bookingsFilters.checkInFrom,
    bookingsFilters.checkInTo,
    bookingsFilters.statuses.length,
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

    if (!purchaseFormValues.itemId.trim()) {
      setPurchaseFormError('Item ID is required.')
      return
    }
    if (!purchaseFormValues.itemName.trim()) {
      setPurchaseFormError('Item name is required.')
      return
    }
    if (!purchaseFormValues.location.trim()) {
      setPurchaseFormError('Location is required.')
      return
    }
    if (!purchaseFormValues.vendor.trim()) {
      setPurchaseFormError('Vendor is required.')
      return
    }
    if (!purchaseFormValues.units.trim()) {
      setPurchaseFormError('Units are required.')
      return
    }
    if (!purchaseFormValues.totalPrice.trim()) {
      setPurchaseFormError('Total price is required.')
      return
    }
    if (!purchaseFormValues.deliveryDate.trim()) {
      setPurchaseFormError('Delivery date is required.')
      return
    }

    setIsPurchaseSaving(true)
    setPurchaseFormError(null)

    const statusValue =
      purchaseFormValues.status === 'Confirmed' ? 'Confirmed' : undefined
    const payload = {
      id: purchaseFormValues.id.trim() || undefined,
      'Item id': purchaseFormValues.itemId.trim(),
      'Item name': purchaseFormValues.itemName.trim(),
      Location: purchaseFormValues.location.trim(),
      Vendor: purchaseFormValues.vendor.trim(),
      Units: Number(purchaseFormValues.units) || 0,
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
    const shouldConfirm = window.confirm(
      'Are you sure you want to confirm this delivery?',
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
        'Item id': row.itemId,
        'Item name': row.itemName,
        Location: row.location,
        Vendor: row.vendor,
        Units: row.units,
        'Total price': row.totalPrice,
        'Delivery date': formatDateForStorage(row.deliveryDateRaw),
        'Purchase date': formatDateForStorage(row.purchaseDateRaw),
        Status: 'Confirmed',
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
      setPurchaseRows((current) =>
        current.map((entry) =>
          entry.id === row.id ? { ...entry, status: 'Confirmed' } : entry,
        ),
      )
    } catch (updateError) {
      setPurchasesError('Unable to update purchase status. Please try again.')
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
      setSubtractionFormError('Item ID is required.')
      return
    }
    if (!subtractionFormValues.itemName.trim()) {
      setSubtractionFormError('Item name is required.')
      return
    }
    if (!subtractionFormValues.propertyId.trim()) {
      setSubtractionFormError('Receiving property is required.')
      return
    }
    if (!subtractionFormValues.location.trim()) {
      setSubtractionFormError('Receiving property is required.')
      return
    }
    if (!subtractionFormValues.units.trim()) {
      setSubtractionFormError('Units are required.')
      return
    }
    const unitsValue = Number(subtractionFormValues.units)
    if (!Number.isFinite(unitsValue) || unitsValue <= 0) {
      setSubtractionFormError('Units must be greater than zero.')
      return
    }
    if (!subtractionFormValues.cost.trim()) {
      setSubtractionFormError('Cost is required.')
      return
    }
    const costValue = Number(subtractionFormValues.cost)
    if (!Number.isFinite(costValue) || costValue < 0) {
      setSubtractionFormError('Cost must be a valid number.')
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
            status: computeInventoryStatus(nextQuantity, row.rebuyQty),
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
      'Mark this subtraction as billed?',
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
      'Reverse this subtraction and restore inventory quantity?',
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
            status: computeInventoryStatus(nextQuantity, entry.rebuyQty),
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

    const consumptionRules = buildConsumptionRules(formValues)
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
      consumptionRules: consumptionRules ?? undefined,
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
      setAlertsError('Unable to update alert status. Please try again.')
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

  return (
    <div
      className={`app ${isSidebarCollapsed ? 'app-collapsed' : ''} ${
        isMobileNavOpen ? 'mobile-nav-is-open' : ''
      }`}
    >
      <header className="mobile-topbar">
        <button
          className="btn-icon btn-icon-ghost mobile-menu-button"
          type="button"
          aria-label={isMobileNavOpen ? t('common.closeMenu') : t('common.openMenu')}
          aria-expanded={isMobileNavOpen}
          onClick={() => (isMobileNavOpen ? closeMobileNav() : openMobileNav())}
        >
          {isMobileNavOpen ? (
            <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <div className="mobile-topbar-brand">
          <span className="mobile-topbar-title">Yalla!</span>
          <span className="mobile-topbar-page">{pageLabel(activePage)}</span>
        </div>
        {pendingAlertsCount > 0 ? (
          <button
            className="mobile-topbar-alert"
            type="button"
            aria-label={t('common.pendingAlerts', { count: pendingAlertsCount })}
            onClick={() => navigateToPage('Alerts')}
          >
            {pendingAlertsCount}
          </button>
        ) : (
          <span className="mobile-topbar-spacer" aria-hidden="true" />
        )}
      </header>

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
                      <span>{pageLabel(item)}</span>
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
                        aria-label={pageLabel(item)}
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
                          {pageLabel(item)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </nav>
        <LanguageSwitcher compact={isSidebarCollapsed} />
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
                  <h1 className="page-title">{pageLabel('Inventory')}</h1>
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
                  onClick={exportInventory}
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
                        aria-label="Close filters"
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
                          {t('common.itemName')}
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
                                <div>
                                  <p className="detail-label">{t('common.tolerance')}</p>
                                  <p className="detail-value">
                                    {row.tolerance || '—'}
                                  </p>
                                </div>
                                <div className="detail-span">
                                  <p className="detail-label">
                                    {t('common.consumptionRules')}
                                  </p>
                                  <div className="rules-grid">
                                    <div className="rule-card">
                                      <p className="rule-title">{t('common.apartment')}</p>
                                      <p className="rule-value">
                                        {row.consumptionRules?.apartment
                                          ? `${row.consumptionRules.apartment.amount} / ${row.consumptionRules.apartment.unit}`
                                          : '—'}
                                      </p>
                                    </div>
                                    <div className="rule-card">
                                      <p className="rule-title">{t('common.hostel')}</p>
                                      <p className="rule-value">
                                        {row.consumptionRules?.hostel
                                          ? `${row.consumptionRules.hostel.amount} / ${row.consumptionRules.hostel.unit}`
                                          : '—'}
                                      </p>
                                    </div>
                                    <div className="rule-card">
                                      <p className="rule-title">{t('common.room')}</p>
                                      <p className="rule-value">
                                        {row.consumptionRules?.room
                                          ? `${row.consumptionRules.room.amount} / ${row.consumptionRules.room.unit}`
                                          : '—'}
                                      </p>
                                    </div>
                                  </div>
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
        ) : activePage === 'Purchases' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('purchases.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">{pageLabel('Purchases')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Purchase data is read from the production DynamoDB table via
                  Lambda access.
                </p>
              </div>
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
                  className="btn-primary"
                  onClick={fetchPurchases}
                  type="button"
                  disabled={isPurchasesLoading}
                  aria-label="Refresh"
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
            </header>

            {purchasesError ? <div className="alert">{purchasesError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Total purchases</p>
                <p className="card-value">{purchasesFilteredRows.length}</p>
                <p className="card-meta">Visible purchases</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Pending deliveries</p>
                <p className="card-value">{pendingPurchasesCount}</p>
                <p className="card-meta">Awaiting confirmation</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last Sync</p>
                <p className="card-value">
                  {purchasesLastUpdated ?? 'Not synced yet'}
                </p>
                <p className="card-meta">Production DynamoDB</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Purchases</h2>
                  <p className="card-subtitle">
                    Confirm delivery to mark purchases as delivered.
                  </p>
                </div>
              </div>

              {isPurchasesFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Select one or more values to filter the purchases.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsPurchasesFilterOpen(false)}
                        aria-label="Close filters"
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
                                No locations available yet.
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
                          <p className="filter-title">Delivery date range</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>From</span>
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
                              <span>To</span>
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
                      <th scope="col">Delivery date</th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPurchasesLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          Loading purchases...
                        </td>
                      </tr>
                    ) : purchasesFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          {purchaseRows.length > 0
                            ? 'No purchases match the current filters.'
                            : 'No purchases available yet.'}
                        </td>
                      </tr>
                    ) : (
                      purchasesFilteredRows.map((row) => {
                        const isExpanded = expandedPurchaseIds.has(row.id)
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
                              <td>{row.deliveryDate}</td>
                              <td>
                                <div className="action-buttons">
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label="Confirm delivery"
                                    onClick={() => confirmPurchaseDelivery(row)}
                                    disabled={row.status === 'Confirmed'}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label="Edit purchase"
                                    onClick={() => openPurchaseEdit(row)}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    onClick={() => togglePurchaseRow(row.id)}
                                    aria-expanded={isExpanded}
                                    aria-label="Toggle details"
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
                                      <p className="detail-label">Purchase ID</p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.itemId')}</p>
                                      <p className="detail-value">{row.itemId}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Vendor</p>
                                      <p className="detail-value">{row.vendor}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Units</p>
                                      <p className="detail-value">{row.units}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Total price</p>
                                      <p className="detail-value">
                                        {row.totalPrice}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Purchase date</p>
                                      <p className="detail-value">
                                        {row.purchaseDate}
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
        ) : activePage === 'Subtractions' ? (
          <>
            <header className="page-header">
              <div className="page-header-leading">
                <p className="eyebrow">{t('subtractions.eyebrow')}</p>
                <div className="page-title-row">
                  <h1 className="page-title">{pageLabel('Subtractions')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Manual inventory removals are stored in the production DynamoDB
                  table via Lambda access.
                </p>
              </div>
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
                  className="btn-primary"
                  onClick={fetchSubtractions}
                  type="button"
                  disabled={isSubtractionsLoading}
                  aria-label="Refresh"
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
            </header>

            {subtractionsError ? (
              <div className="alert">{subtractionsError}</div>
            ) : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Total subtractions</p>
                <p className="card-value">{subtractionsFilteredRows.length}</p>
                <p className="card-meta">Visible subtractions</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Pending billing</p>
                <p className="card-value">{pendingSubtractionsCount}</p>
                <p className="card-meta">Awaiting billing</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last Sync</p>
                <p className="card-value">
                  {subtractionsLastUpdated ?? 'Not synced yet'}
                </p>
                <p className="card-meta">Production DynamoDB</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Subtractions</h2>
                  <p className="card-subtitle">
                    Track manual inventory removals and billing status.
                  </p>
                </div>
              </div>

              {isSubtractionsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Select one or more values to filter the subtractions.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsSubtractionsFilterOpen(false)}
                        aria-label="Close filters"
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
                                No locations available yet.
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
                          <p className="filter-title">Date range</p>
                          <div className="form-grid">
                            <label className="form-field">
                              <span>From</span>
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
                              <span>To</span>
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

              <div className="table-wrapper" aria-busy={isSubtractionsLoading}>
                <table className="data-table data-table-subtractions">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.itemName')}</th>
                      <th scope="col">{t('common.location')}</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">Date</th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSubtractionsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          Loading subtractions...
                        </td>
                      </tr>
                    ) : subtractionsFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          No subtractions available yet.
                        </td>
                      </tr>
                    ) : (
                      subtractionsFilteredRows.map((row) => {
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
                                    aria-label="Mark billed"
                                    title="Mark billed"
                                    onClick={() => markSubtractionBilled(row)}
                                    disabled={row.status !== 'Pending Billing'}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label="Reverse subtraction"
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
                                    aria-label="Toggle details"
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
                                        Subtraction ID
                                      </p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">{t('common.itemId')}</p>
                                      <p className="detail-value">{row.itemId}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        Inventory location
                                      </p>
                                      <p className="detail-value">
                                        {row.inventoryLocation}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Property ID</p>
                                      <p className="detail-value">
                                        {row.propertyId}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Units</p>
                                      <p className="detail-value">{row.units}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Cost</p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.cost)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Total</p>
                                      <p className="detail-value">
                                        {formatUnitPrice(row.units * row.cost)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Billable</p>
                                      <p className="detail-value">
                                        {row.billable ? 'Yes' : 'No'}
                                      </p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">Note</p>
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
                  <h1 className="page-title">{pageLabel('Properties')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Property data is read from the production DynamoDB table via
                  Lambda access.
                </p>
              </div>
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
            </header>

            {propertiesError ? <div className="alert">{propertiesError}</div> : null}
            {propertiesSyncMessage ? (
              <div className="properties-note">{propertiesSyncMessage}</div>
            ) : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Active properties</p>
                <p className="card-value">{activePropertiesCount}</p>
                <p className="card-meta">MTL parent properties are excluded</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Filtered properties</p>
                <p className="card-value">{filteredPropertiesCount}</p>
                <p className="card-meta">Visible in current filters</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last Sync</p>
                <p className="card-value">
                  {propertiesLastUpdated ?? 'Not synced yet'}
                </p>
                <p className="card-meta">Fetched from Guesty PMS</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Properties</h2>
                  <p className="card-subtitle">
                    Use Refresh to compare with the external source.
                  </p>
                </div>
              </div>

              {isPropertiesFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Select one or more values to filter the properties.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsPropertiesFilterOpen(false)}
                        aria-label="Close filters"
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
                          Nickname
                          <span className="sort-indicator">
                            {propertiesSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Title</th>
                      <th scope="col">Type</th>
                      <th scope="col">RoomType</th>
                      <th scope="col">Neighborhood</th>
                      <th scope="col">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPropertiesLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          Loading properties...
                        </td>
                      </tr>
                    ) : propertiesFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          No properties available yet.
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
                              {row.active ? 'Active' : 'Inactive'}
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
                  <h1 className="page-title">{pageLabel('Bookings')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Booking data is read from the production DynamoDB table via Lambda
                  access.
                </p>
              </div>
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
                  disabled={isBookingsLoading}
                >
                  Refresh
                </button>
                </div>
              </div>
            </header>

            {bookingsError ? <div className="alert">{bookingsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Visible bookings</p>
                <p className="card-value">{sortedBookingsRows.length}</p>
                <p className="card-meta">Rows in the current page</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Page size</p>
                <p className="card-value">{bookingsPageSize}</p>
                <p className="card-meta">Server-side pagination size</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last refresh</p>
                <p className="card-value">{bookingsLastUpdated ?? 'Not refreshed yet'}</p>
                <p className="card-meta">Fetched from DynamoDB</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Bookings</h2>
                  <p className="card-subtitle">
                    Use cursor pagination and check-in filters for large booking
                    datasets.
                  </p>
                </div>
                <div className="table-actions">
                  <label className="form-field">
                    <span>Rows per page</span>
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
                        aria-label="Close filters"
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
                              const isChecked =
                                bookingsFilterDraft.statuses.includes(option)
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
                          <p className="filter-title">Check-in range</p>
                          <div className="filter-options">
                            <label className="form-field">
                              <span>From</span>
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
                              <span>To</span>
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
                        onClick={() =>
                          setBookingsFilterDraft({
                            statuses: [],
                            checkInFrom: '',
                            checkInTo: '',
                          })
                        }
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
                      <th scope="col">Booking</th>
                      <th scope="col">Guest</th>
                      <th scope="col">Property</th>
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
                          Check-in
                          <span className="sort-indicator">
                            {bookingsSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Check-out</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isBookingsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={7}>
                          Loading bookings...
                        </td>
                      </tr>
                    ) : sortedBookingsRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={7}>
                          No bookings found for this page and filter combination.
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
                  Previous
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
                  Next
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
                  <h1 className="page-title">{pageLabel('Reviews')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Refresh triggers a sync run and then reloads data and sync-state.
                </p>
              </div>
              <div className="page-action-bar">
                <div className="header-actions">
                <button
                  className={`btn-icon btn-icon-ghost btn-filter ${
                    reviewsCreatedPreset === 'last7' ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label="Show last 7 days"
                  title="Rating < 5, last 7 days"
                  onClick={() =>
                    setReviewsCreatedPreset((current) =>
                      current === 'last7' ? 'none' : 'last7',
                    )
                  }
                >
                  7d
                </button>
                <button
                  className={`btn-icon btn-icon-ghost btn-filter ${
                    reviewsCreatedPreset === 'last30' ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label="Show last 30 days"
                  title="Rating < 5, last 30 days"
                  onClick={() =>
                    setReviewsCreatedPreset((current) =>
                      current === 'last30' ? 'none' : 'last30',
                    )
                  }
                >
                  30d
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
                  className="btn-ghost"
                  type="button"
                  onClick={() => void refreshReviews()}
                  disabled={isReviewsLoading || isReviewsSyncing}
                >
                  {isReviewsSyncing ? 'Syncing...' : 'Refresh'}
                </button>
                </div>
              </div>
            </header>

            {reviewsError ? <div className="alert">{reviewsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Total reviews</p>
                <p className="card-value">{sortedReviewsRows.length}</p>
                <p className="card-meta">Total shown with current filters</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Pending reviews under 5</p>
                <p className="card-value">{reviewsPendingUnderFiveCount}</p>
                <p className="card-meta">Status Pending and rating below 5</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last sync</p>
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
                  <h2 className="card-title">Reviews</h2>
                  <p className="card-subtitle">
                    Click details to reveal private and public review content.
                  </p>
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
                        aria-label="Close filters"
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
                              <span>ListingNickname</span>
                              <select
                                value={reviewsFilterDraft.listingNickname}
                                onChange={(event) =>
                                  setReviewsFilterDraft((current) => ({
                                    ...current,
                                    listingNickname: event.target.value,
                                  }))
                                }
                              >
                                <option value="">All properties</option>
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
                              <span>Min rating</span>
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
                              <span>Max rating</span>
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
                              <span>From</span>
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
                              <span>To</span>
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
                      <th scope="col">Guest</th>
                      <th scope="col">Listing</th>
                      <th scope="col">Rating</th>
                      <th scope="col">
                        <button
                          className="btn-sort is-active"
                          type="button"
                          onClick={() =>
                            setReviewsSortDirection((current) =>
                              current === 'asc' ? 'desc' : 'asc',
                            )
                          }
                        >
                          Created at
                          <span className="sort-indicator">
                            {reviewsSortDirection === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isReviewsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          Loading reviews...
                        </td>
                      </tr>
                    ) : sortedReviewsRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={6}>
                          No reviews available yet.
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
                                      <p className="detail-label">Informative section</p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">Private Note</p>
                                      <p className="detail-value">{row.privateReview}</p>
                                    </div>
                                    <div className="detail-span">
                                      <p className="detail-label">Public Review</p>
                                      <p className="detail-value">{row.publicReview}</p>
                                    </div>
                                    <div className="detail-span">
                                      <details>
                                        <summary className="btn-link">
                                          Review breakdown
                                        </summary>
                                        <div className="rules-grid">
                                          <div className="rule-card">
                                            <p className="rule-title">Accuracy</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.accuracy || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">Check-in</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.checkIn || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">Cleanliness</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.cleanliness || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">Communication</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.communication || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">Location</p>
                                            <p className="rule-value">
                                              {row.categoryRatings.location || '—'}
                                            </p>
                                          </div>
                                          <div className="rule-card">
                                            <p className="rule-title">Value</p>
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
                                            <p className="detail-label">Total Guest Payment</p>
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
                                      <p className="detail-label">Workflow section</p>
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
                  <h1 className="page-title">{pageLabel('Alerts')}</h1>
                  <button
                    type="button"
                    className={`btn-page-info ${
                      isSummaryInfoOpen ? 'is-active' : ''
                    }`}
                    aria-label={
                      isSummaryInfoOpen ? 'Hide summary info' : 'Show summary info'
                    }
                    aria-expanded={isSummaryInfoOpen}
                    onClick={() => setIsSummaryInfoOpen((current) => !current)}
                  >
                    i
                  </button>
                </div>
                <p className="subtitle">
                  Alerts are read from the production DynamoDB table via Lambda
                  access.
                </p>
              </div>
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
            </header>

            {alertsError ? <div className="alert">{alertsError}</div> : null}

            <section
              className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
            >
              <div className="card card-compact">
                <p className="card-label">Total alerts</p>
                <p className="card-value">{alertRows.length}</p>
                <p className="card-meta">All origins</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Pending</p>
                <p className="card-value">{pendingAlertsCount}</p>
                <p className="card-meta">Needs action</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last Sync</p>
                <p className="card-value">
                  {alertsLastUpdated ?? 'Not synced yet'}
                </p>
                <p className="card-meta">Production DynamoDB</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Alerts</h2>
                  <p className="card-subtitle">
                    Pending alerts are shown by default.
                  </p>
                </div>
              </div>

              {isAlertsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">{t('common.filters')}</h3>
                        <p className="modal-subtitle">
                          Select one or more values to filter the alerts.
                        </p>
                      </div>
                      <button
                        className="btn-icon"
                        type="button"
                        onClick={() => setIsAlertsFilterOpen(false)}
                        aria-label="Close filters"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="filter-grid">
                        <div className="filter-group">
                          <p className="filter-title">Origin</p>
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
                      <th scope="col">Name</th>
                      <th scope="col">Description</th>
                      <th scope="col">Date</th>
                      <th scope="col">{t('common.status')}</th>
                      <th scope="col">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isAlertsLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          Loading alerts...
                        </td>
                      </tr>
                    ) : alertsFilteredRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          No alerts available.
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
                                    aria-label="Mark done"
                                    onClick={() =>
                                      updateAlertStatus(row.id, 'Done')
                                    }
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    aria-label="Snooze alert"
                                    onClick={() => openSnoozeModal(row.id)}
                                  >
                                    ⏲
                                  </button>
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    onClick={() => toggleAlertRow(row.id)}
                                    aria-expanded={isExpanded}
                                    aria-label="Toggle details"
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
                                      <p className="detail-label">Alert ID</p>
                                      <p className="detail-value">{row.id}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Origin</p>
                                      <p className="detail-value">{row.origin}</p>
                                    </div>
                                    <div>
                                      <p className="detail-label">Created by</p>
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
            getEndpoint={getEndpoint}
            getCurrentUserEmail={getCurrentUserEmail}
            propertyOptions={propertyRows
              .filter((row) => row.active)
              .map((row) => ({
                id: row.id,
                nickname: row.nickname,
                title: row.title,
                listingNickname: row.nickname,
              }))}
          />
        ) : activePage === 'Chatbot' ? (
          <ChatbotView />
        ) : (
          <section className="card">
            <h1 className="page-title">{pageLabel(activePage)}</h1>
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
                  <h3 className="modal-title">Property changes detected</h3>
                  <p className="modal-subtitle">
                    Select each change to apply in DynamoDB table yalla-properties.
                  </p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setIsPropertiesDiffOpen(false)}
                  aria-label="Close property changes"
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
                            {diff.action === 'add' ? 'Add' : 'Remove'}{' '}
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
                    <label className="form-field form-field-span">
                      <span>{t('common.consumptionRules')}</span>
                      <div className="rule-form-grid">
                        <div className="rule-form">
                          <p className="rule-form-title">{t('common.apartment')}</p>
                          <div className="rule-form-fields">
                            <input
                              type="number"
                              min="0"
                              value={formValues.apartmentAmount}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  apartmentAmount: event.target.value,
                                }))
                              }
                              placeholder={t('common.amount')}
                            />
                            <input
                              type="text"
                              value={formValues.apartmentUnit}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  apartmentUnit: event.target.value,
                                }))
                              }
                              placeholder={t('common.unit')}
                            />
                          </div>
                        </div>
                        <div className="rule-form">
                          <p className="rule-form-title">{t('common.hostel')}</p>
                          <div className="rule-form-fields">
                            <input
                              type="number"
                              min="0"
                              value={formValues.hostelAmount}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  hostelAmount: event.target.value,
                                }))
                              }
                              placeholder={t('common.amount')}
                            />
                            <input
                              type="text"
                              value={formValues.hostelUnit}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  hostelUnit: event.target.value,
                                }))
                              }
                              placeholder={t('common.unit')}
                            />
                          </div>
                        </div>
                        <div className="rule-form">
                          <p className="rule-form-title">{t('common.room')}</p>
                          <div className="rule-form-fields">
                            <input
                              type="number"
                              min="0"
                              value={formValues.roomAmount}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  roomAmount: event.target.value,
                                }))
                              }
                              placeholder={t('common.amount')}
                            />
                            <input
                              type="text"
                              value={formValues.roomUnit}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  roomUnit: event.target.value,
                                }))
                              }
                              placeholder={t('common.unit')}
                            />
                          </div>
                        </div>
                      </div>
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
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              {(() => {
                const isEditingPurchase = Boolean(purchaseFormValues.id)
                return (
                  <div className="modal-header">
                    <div>
                      <h3 className="modal-title">
                        {isEditingPurchase ? 'Purchase' : 'New Purchase.'}
                      </h3>
                      {isEditingPurchase ? (
                        <p className="modal-subtitle">
                          Update the purchase record.
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
                      aria-label="Close purchase form"
                    >
                      ✕
                    </button>
                  </div>
                )
              })()}
              <div className="modal-body">
                <div className="form-grid">
                  <label className="form-field">
                    <span>Vendor</span>
                    <input
                      type="text"
                      value={purchaseFormValues.vendor}
                      onChange={(event) =>
                        setPurchaseFormValues((current) => ({
                          ...current,
                          vendor: event.target.value,
                        }))
                      }
                      placeholder="Vendor name"
                    />
                  </label>
                  <label className="form-field">
                    <span>Units</span>
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
                    <span>Total price</span>
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
                    <span>Delivery date</span>
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
                  aria-label="Close subtraction form"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <label className="form-field">
                    <span>Units</span>
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
                    <span>Receiving property</span>
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
                      <option value="">Select property</option>
                      {activePropertyOptions.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Cost</span>
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
                  <label className="form-field form-field-checkbox">
                    <span>Should be billed?</span>
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
                  </label>
                  <label className="form-field form-field-span">
                    <span>Note (optional)</span>
                    <textarea
                      value={subtractionFormValues.note}
                      onChange={(event) =>
                        setSubtractionFormValues((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Add a note"
                      rows={3}
                    />
                  </label>
                </div>
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
                  aria-label="Close snooze"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <label className="form-field">
                  <span>Reminder date</span>
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
                      setSnoozeError('Select a reminder date.')
                      return
                    }
                    if (!snoozeTargetId) {
                      setSnoozeError('Missing alert ID.')
                      return
                    }
                    const snoozeUntil = formatSnoozeUntil(snoozeDate)
                    if (!snoozeUntil) {
                      setSnoozeError('Select a valid date.')
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
