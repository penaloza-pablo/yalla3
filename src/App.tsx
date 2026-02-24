import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { fetchUserAttributes } from 'aws-amplify/auth'
import outputs from '../amplify_outputs.json'
import type {
  ConversationMessage,
  ConversationMessageContent,
} from '@aws-amplify/ui-react-ai'
import { useAIConversation } from './client'
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

type InventoryFormState = {
  id: string
  name: string
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

const navigation = [
  {
    section: 'Ops',
    items: ['Inventory', 'Purchases', 'Properties', 'Cleaning Report', 'Task Scheduler'],
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

const inventoryFieldMap = {
  id: ['id', 'ID'],
  name: ['Item name', 'item name', 'name'],
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

const formatDateForStorage = (value: string) => {
  if (!value) {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${now.getFullYear()}`
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
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

function App() {
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
  const [activePage, setActivePage] = useState('Inventory')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
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
          const response = await fetch('/amplify_outputs.json', {
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
        <h1 className="page-title">Chatbot</h1>
        <p className="subtitle">
          Test conversational AI powered by Amplify in this environment.
        </p>
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
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </p>
                    <p className="chat-content">
                      {formatChatContent(message.content)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="chat-empty">
                  Start a conversation to see responses here.
                </p>
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
                placeholder="Ask about inventory or alerts..."
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
                  {isChatLoading ? 'Sending...' : 'Send'}
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
              <h2 className="card-title">Quick prompts</h2>
              <p className="card-subtitle">
                Try a starter prompt to validate the AI route.
              </p>
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

  const pendingPurchasesCount = useMemo(
    () => purchaseRows.filter((row) => row.status !== 'Confirmed').length,
    [purchaseRows],
  )

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
      const response = await fetch(endpoint)
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
      const response = await fetch(endpoint)
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
      const response = await fetch(endpoint)
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
      const response = await fetch(endpoint)
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
  }, [activePage, fetchAlerts, fetchInventory, fetchPurchases])

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
      `Are you sure you want to delete "${row.name}" (${row.id})?`,
    )
    if (!confirmed) return

    const endpoint = getEndpoint(
      'deleteInventoryUrl',
      import.meta.env.VITE_DELETE_INVENTORY_URL,
    )
    if (!endpoint) {
      setError(
        'Missing delete endpoint. Set VITE_DELETE_INVENTORY_URL in the environment.',
      )
      return
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      if (!response.ok) throw new Error('Failed to delete item.')
      await fetchInventory()
    } catch (deleteError) {
      setError('Unable to delete the item. Please try again.')
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
        return a.name.localeCompare(b.name) * direction
      }
      if (sortConfig.key === 'status') {
        const statusDiff =
          (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0)
        if (statusDiff !== 0) {
          return statusDiff * direction
        }
        return a.name.localeCompare(b.name) * direction
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
      return statusMatch && originMatch
    })
  }, [alertRows, alertsFilters.origins, alertsFilters.statuses])

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
      return locationMatch && statusMatch && categoryMatch
    })
  }, [filters.locations, filters.statuses, filters.categories, inventoryRows])

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

  const goToRestockStep = () => {
    setFormError(null)
    if (!formValues.name.trim()) {
      setFormError('Item name is required.')
      return
    }
    const resolvedCategory = resolveChoice(
      formValues.categoryChoice,
      formValues.categoryOther,
    )
    if (!resolvedCategory) {
      setFormError('Category is required.')
      return
    }
    const resolvedLocation = resolveChoice(
      formValues.locationChoice,
      formValues.locationOther,
    )
    if (!resolvedLocation) {
      setFormError('Location is required.')
      return
    }
    if (!formValues.quantity.trim()) {
      setFormError('Quantity is required.')
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

    const purchaseDateValue =
      purchaseFormValues.purchaseDate?.trim() || formatDateForStorage('')
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
      'Purchase date': formatDateForStorage(purchaseDateValue),
      ...(statusValue ? { Status: statusValue } : {}),
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Failed to save purchase.')
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
      setPurchaseFormError('Unable to save the purchase. Please try again.')
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
      const response = await fetch(endpoint, {
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

  const saveItem = async () => {
    const endpoint = getEndpoint(
      'upsertInventoryUrl',
      import.meta.env.VITE_UPSERT_INVENTORY_URL,
    )
    if (!endpoint) {
      setFormError(
        'Missing upsert endpoint. Set VITE_UPSERT_INVENTORY_URL in the environment.',
      )
      return
    }

    if (!formValues.name.trim()) {
      setFormError('Item name is required.')
      return
    }

    const resolvedCategory = resolveChoice(
      formValues.categoryChoice,
      formValues.categoryOther,
    )
    if (!resolvedCategory) {
      setFormError('Category is required.')
      return
    }

    const resolvedLocation = resolveChoice(
      formValues.locationChoice,
      formValues.locationOther,
    )
    if (!resolvedLocation) {
      setFormError('Location is required.')
      return
    }

    if (!formValues.quantity.trim()) {
      setFormError('Quantity is required.')
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
      const response = await fetch(endpoint, {
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
      setFormError('Unable to save the item. Please try again.')
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
      const response = await fetch(endpoint, {
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

  const handleSectionShortcut = (section: string) => {
    setIsSidebarCollapsed(false)
    setCollapsedSections((current) => {
      const next = new Set(current)
      next.delete(section)
      return next
    })
  }

  return (
    <div className={`app ${isSidebarCollapsed ? 'app-collapsed' : ''}`}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="brand">
          <span className="brand-title">
            {isSidebarCollapsed ? 'Y!' : 'Yalla!'}
          </span>
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
                      onClick={() => setActivePage(item)}
                    >
                      <span>{item}</span>
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
                        onClick={() => setActivePage(item)}
                        aria-label={item}
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
                      aria-label={`Open ${group.section}`}
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
                <span>{group.section}</span>
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
                          onClick={() => setActivePage(item)}
                        >
                          {item}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>
      <button
        className={`btn-icon btn-icon-ghost sidebar-toggle ${
          isSidebarCollapsed ? 'is-collapsed' : ''
        }`}
        type="button"
        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={handleSidebarToggle}
      >
        {isSidebarCollapsed ? '›' : '‹'}
      </button>

      <main className="main">
        {activePage === 'Inventory' ? (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">Ops / Inventory</p>
                <h1 className="page-title">Inventory</h1>
                <p className="subtitle">
                  Inventory data is read from the production DynamoDB table via
                  Lambda access.
                </p>
              </div>
              <div className="header-actions">
                <button
                  className={`btn-ghost btn-filter ${
                    isFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label="Filters"
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
                  aria-label="Export"
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
                  aria-label="Add item"
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
            </header>

            {error ? <div className="alert">{error}</div> : null}

            <section className="summary-cards">
              <div className="card card-compact">
                <p className="card-label">Locations</p>
                <p className="card-value">{locationCount}</p>
                <p className="card-meta">Visible locations</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Reorder</p>
                <p className="card-value">{reorderCount}</p>
                <p className="card-meta">Requires purchase</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Low Stock</p>
                <p className="card-value">{lowStockCount}</p>
                <p className="card-meta">Needs attention</p>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Inventory</h2>
                  <p className="card-subtitle">
                    Live data from production will appear here.
                  </p>
                </div>
                <div className="table-actions">
                  <input
                    className="search-input"
                    placeholder="Search inventory"
                    type="search"
                    aria-label="Search inventory"
                  />
                </div>
              </div>

              {isFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">Filters</h3>
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
                          <p className="filter-title">Location</p>
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
                          <p className="filter-title">Category</p>
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
                          <p className="filter-title">Status</p>
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
                        Clear
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
                        Apply filters
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isLoading}>
                <table>
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
                          Item name
                          <span className="sort-indicator">
                            {sortConfig.key === 'name'
                              ? sortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Location</th>
                      <th scope="col">
                        <button
                          className={`btn-sort ${
                            sortConfig.key === 'status' ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() => toggleSort('status')}
                        >
                          Status
                          <span className="sort-indicator">
                            {sortConfig.key === 'status'
                              ? sortConfig.direction === 'asc'
                                ? '▲'
                                : '▼'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                    <td className="table-empty" colSpan={5}>
                          Loading inventory...
                        </td>
                      </tr>
                    ) : inventoryRows.length === 0 ? (
                      <tr>
                    <td className="table-empty" colSpan={5}>
                          No inventory data available yet.
                        </td>
                      </tr>
                ) : (
                  applySort(filteredRows).map((row) => {
                      const isExpanded = expandedRowIds.has(row.id)
                      return (
                        <Fragment key={row.id}>
                        <tr>
                          <td>{row.name}</td>
                          <td>{row.location}</td>
                          <td>
                            <span className={getStatusClassName(row.status)}>
                              {row.status}
                            </span>
                          </td>
                          <td>{row.quantity}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => openPurchaseWizard(row)}
                                aria-label="Create purchase"
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
                                onClick={() => openEditItem(row)}
                                aria-label="Edit item"
                              >
                                ✎
                              </button>
                              <button
                                className="btn-icon btn-icon-ghost"
                                type="button"
                                onClick={() => deleteItem(row)}
                                aria-label="Delete item"
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
                                  <p className="detail-label">Item ID</p>
                                  <p className="detail-value">{row.id}</p>
                                </div>
                                <div>
                                  <p className="detail-label">Category</p>
                                  <p className="detail-value">
                                    {row.category || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">Last updated</p>
                                  <p className="detail-value">{row.updated}</p>
                                </div>
                                <div>
                                  <p className="detail-label">Rebuy quantity</p>
                                  <p className="detail-value">
                                    {row.rebuyQty || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">Unit price</p>
                                  <p className="detail-value">
                                    {formatUnitPrice(row.unitPrice)}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">Tolerance</p>
                                  <p className="detail-value">
                                    {row.tolerance || '—'}
                                  </p>
                                </div>
                                <div className="detail-span">
                                  <p className="detail-label">
                                    Consumption rules
                                  </p>
                                  <div className="rules-grid">
                                    <div className="rule-card">
                                      <p className="rule-title">Apartment</p>
                                      <p className="rule-value">
                                        {row.consumptionRules?.apartment
                                          ? `${row.consumptionRules.apartment.amount} / ${row.consumptionRules.apartment.unit}`
                                          : '—'}
                                      </p>
                                    </div>
                                    <div className="rule-card">
                                      <p className="rule-title">Hostel</p>
                                      <p className="rule-value">
                                        {row.consumptionRules?.hostel
                                          ? `${row.consumptionRules.hostel.amount} / ${row.consumptionRules.hostel.unit}`
                                          : '—'}
                                      </p>
                                    </div>
                                    <div className="rule-card">
                                      <p className="rule-title">Room</p>
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
              <div>
                <p className="eyebrow">Ops / Inventory / Purchases</p>
                <h1 className="page-title">Purchases</h1>
                <p className="subtitle">
                  Purchase data is read from the production DynamoDB table via
                  Lambda access.
                </p>
              </div>
              <div className="header-actions">
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={fetchPurchases}
                  disabled={isPurchasesLoading}
                >
                  Refresh
                </button>
              </div>
            </header>

            {purchasesError ? <div className="alert">{purchasesError}</div> : null}

            <section className="summary-cards">
              <div className="card card-compact">
                <p className="card-label">Total purchases</p>
                <p className="card-value">{purchaseRows.length}</p>
                <p className="card-meta">All vendors</p>
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
                <div className="table-actions">
                  <input
                    className="search-input"
                    placeholder="Search purchases"
                    type="search"
                    aria-label="Search purchases"
                  />
                </div>
              </div>

              <div className="table-wrapper" aria-busy={isPurchasesLoading}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item name</th>
                      <th scope="col">Location</th>
                      <th scope="col">Status</th>
                      <th scope="col">Delivery date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPurchasesLoading ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          Loading purchases...
                        </td>
                      </tr>
                    ) : purchaseRows.length === 0 ? (
                      <tr>
                        <td className="table-empty" colSpan={5}>
                          No purchases available yet.
                        </td>
                      </tr>
                    ) : (
                      purchaseRows.map((row) => {
                        const isExpanded = expandedPurchaseIds.has(row.id)
                        return (
                          <Fragment key={row.id}>
                            <tr>
                              <td>{row.itemName}</td>
                              <td>{row.location}</td>
                              <td>
                                <span className={getStatusClassName(row.status)}>
                                  {row.status}
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
                                      <p className="detail-label">Item ID</p>
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
        ) : activePage === 'Alerts' ? (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">Alerts</p>
                <h1 className="page-title">Alerts</h1>
                <p className="subtitle">
                  Alerts are read from the production DynamoDB table via Lambda
                  access.
                </p>
              </div>
              <div className="header-actions">
                <button className="btn-ghost" type="button" onClick={fetchAlerts}>
                  Refresh
                </button>
              </div>
            </header>

            {alertsError ? <div className="alert">{alertsError}</div> : null}

            <section className="summary-cards">
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
                <div className="table-actions">
                  <input
                    className="search-input"
                    placeholder="Search alerts"
                    type="search"
                    aria-label="Search alerts"
                  />
                  <button
                    className={`btn-icon btn-icon-ghost btn-filter ${
                      isAlertsFilterOpen ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-label="Filters"
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
                </div>
              </div>

              {isAlertsFilterOpen ? (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                  <div className="modal">
                    <div className="modal-header">
                      <div>
                        <h3 className="modal-title">Filters</h3>
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
                          <p className="filter-title">Status</p>
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
                        Clear
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
                        Apply filters
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper" aria-busy={isAlertsLoading}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Description</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
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
                                  {row.status}
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
        ) : activePage === 'Chatbot' ? (
          <ChatbotView />
        ) : (
          <section className="card">
            <h1 className="page-title">{activePage}</h1>
            <p className="subtitle">
              {activePage === 'Chatbot' ? 'Chatbot' : 'Alerts'}
            </p>
          </section>
        )}

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
                  <h3 className="modal-title">Inventory item</h3>
                  <p className="modal-subtitle">
                    Create or update inventory data.
                  </p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={closeForm}
                  aria-label="Close form"
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <p className="modal-subtitle">
                  {formStep === 'details' ? 'Step 1 of 2' : 'Step 2 of 2'}
                </p>
                {formStep === 'details' ? (
                  <div className="form-grid">
                    <label className="form-field">
                      <span>Item name</span>
                      <input
                        type="text"
                        value={formValues.name}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Cleaning Kit"
                      />
                    </label>
                    <label className="form-field">
                      <span>Category</span>
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
                        <option value="">Select</option>
                        {categoryOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                        <option value={OTHER_OPTION}>Other</option>
                      </select>
                    </label>
                    {formValues.categoryChoice === OTHER_OPTION ? (
                      <label className="form-field">
                        <span>Custom category</span>
                        <input
                          type="text"
                          value={formValues.categoryOther}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              categoryOther: event.target.value,
                            }))
                          }
                          placeholder="Welcome kit"
                        />
                      </label>
                    ) : null}
                    <label className="form-field">
                      <span>Location</span>
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
                        <option value="">Select</option>
                        {locationOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                        <option value={OTHER_OPTION}>Other</option>
                      </select>
                    </label>
                    {formValues.locationChoice === OTHER_OPTION ? (
                      <label className="form-field">
                        <span>Custom location</span>
                        <input
                          type="text"
                          value={formValues.locationOther}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              locationOther: event.target.value,
                            }))
                          }
                          placeholder="Warehouse A"
                        />
                      </label>
                    ) : null}
                    <label className="form-field">
                      <span>Quantity</span>
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
                      <span>Rebuy quantity</span>
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
                      <span>Unit price</span>
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
                      <span>Tolerance</span>
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
                      <span>Consumption rules</span>
                      <div className="rule-form-grid">
                        <div className="rule-form">
                          <p className="rule-form-title">Apartment</p>
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
                              placeholder="Amount"
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
                              placeholder="Unit"
                            />
                          </div>
                        </div>
                        <div className="rule-form">
                          <p className="rule-form-title">Hostel</p>
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
                              placeholder="Amount"
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
                              placeholder="Unit"
                            />
                          </div>
                        </div>
                        <div className="rule-form">
                          <p className="rule-form-title">Room</p>
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
                              placeholder="Amount"
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
                              placeholder="Unit"
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
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={goToRestockStep}
                    >
                      Next
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
                      Back
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={saveItem}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save item'}
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

        {isSnoozeOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Snooze alert</h3>
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
