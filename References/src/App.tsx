import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Amplify } from 'aws-amplify'
import outputs from "../amplify_outputs.json";
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

type InventoryFormState = {
  id: string
  name: string
  location: string
  status: string
  quantity: string
  updated: string
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

type InventoryApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

type AlertsApiResponse = {
  items?: Record<string, unknown>[]
  count?: number
}

const navigation = [
  {
    section: 'Ops',
    items: ['Inventory', 'Properties', 'Cleaning Report', 'Task Scheduler'],
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

const inventoryFieldMap = {
  id: ['id', 'ID'],
  name: ['Item name', 'item name', 'name'],
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

const parseDateInputValue = (value: string) => {
  if (!value) {
    return ''
  }

  const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
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
  'In Stock': 1,
}

const mapInventoryRow = (item: Record<string, unknown>): InventoryRow => ({
  id: getStringValue(getItemValue(item, inventoryFieldMap.id)) || '—',
  name: getStringValue(getItemValue(item, inventoryFieldMap.name)) || '—',
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
  location: '',
  status: 'In Stock',
  quantity: '',
  updated: '',
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

function App() {
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [alertRows, setAlertRows] = useState<AlertRow[]>([])
  const [isAlertsLoading, setIsAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [alertsLastUpdated, setAlertsLastUpdated] = useState<string | null>(null)
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set())
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
  const [formValues, setFormValues] = useState<InventoryFormState>(emptyFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activePage, setActivePage] = useState('Inventory')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<{
    key: 'name' | 'status' | null
    direction: 'asc' | 'desc'
  }>({ key: null, direction: 'asc' })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<{
    locations: string[]
    statuses: string[]
  }>({
    locations: [],
    statuses: [],
  })
  const [filterDraft, setFilterDraft] = useState<{
    locations: string[]
    statuses: string[]
  }>({
    locations: [],
    statuses: [],
  })
  const [isChatbotConfigured, setIsChatbotConfigured] = useState(false)

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
      useAIConversation('chatbot')
    const chatMessages = (chatData?.messages ?? []) as ConversationMessage[]

    useEffect(() => {
      const config = Amplify.getConfig() as Record<string, unknown>
      const hasData = Boolean((config as { data?: unknown }).data)
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
          Ask questions about inventory and alerts data.
        </p>
        <div className="chatbot-container">
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
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about inventory or alerts..."
              className="chat-input"
            />
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                const trimmed = chatInput.trim()
                if (!trimmed) {
                  return
                }
                handleSendMessage({ content: [{ text: trimmed }] })
                setChatInput('')
              }}
              disabled={isChatLoading}
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
          {debugOpen ? <ChatbotDebugPanel debugInfo={debugInfo} /> : null}
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

  const lowStockCount = useMemo(
    () =>
      inventoryRows.filter(
        (row) => row.status === 'Low Stock' || row.status === 'Reorder',
      ).length,
    [inventoryRows],
  )

  const pendingAlertsCount = useMemo(
    () => alertRows.filter((row) => row.status === 'Pending').length,
    [alertRows],
  )

  const fetchInventory = useCallback(async () => {
    const endpoint = import.meta.env.VITE_GET_INVENTORY_URL
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
        throw new Error('Inventory request failed.')
      }
      const payload = (await response.json()) as InventoryApiResponse
      const items = Array.isArray(payload.items) ? payload.items : []
      const mappedRows = items.map((entry) =>
        mapInventoryRow(normalizeInventoryItem(entry)),
      )
      setInventoryRows(mappedRows)
      setLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    } catch (requestError) {
      setError('Unable to load inventory data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    const endpoint = import.meta.env.VITE_GET_ALERTS_URL
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
        throw new Error('Alerts request failed.')
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
      setAlertsError('Unable to load alerts. Please try again.')
    } finally {
      setIsAlertsLoading(false)
    }
  }, [])

  const openSnoozeModal = (id: string) => {
    setSnoozeTargetId(id)
    setSnoozeDate('')
    setSnoozeError(null)
    setIsSnoozeOpen(true)
  }

  useEffect(() => {
    const config = Amplify.getConfig() as {
      data?: Record<string, unknown>
    }
    setIsChatbotConfigured(Boolean(config?.data))
    if (activePage === 'Inventory') {
      void fetchInventory()
    }
    if (activePage === 'Alerts') {
      void fetchAlerts()
    }
  }, [activePage, fetchAlerts, fetchInventory])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const openNewItem = () => {
    setFormValues(emptyFormState)
    setFormError(null)
    setIsFormOpen(true)
  }

  const openEditItem = (row: InventoryRow) => {
    const apartmentRule = getRuleValue(row.consumptionRules?.apartment)
    const hostelRule = getRuleValue(row.consumptionRules?.hostel)
    const roomRule = getRuleValue(row.consumptionRules?.room)
    setFormValues({
      id: row.id,
      name: row.name,
      location: row.location,
      status: row.status,
      quantity: row.quantity ? String(row.quantity) : '',
      updated: parseDateInputValue(row.updatedRaw || row.updated),
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
    setFormError(null)
    setIsFormOpen(true)
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
      return locationMatch && statusMatch
    })
  }, [filters.locations, filters.statuses, inventoryRows])

  const activeFilterCount = useMemo(() => {
    return filters.locations.length + filters.statuses.length
  }, [filters.locations, filters.statuses])

  const locationOptions = useMemo(() => {
    const unique = new Set(
      inventoryRows.map((row) => row.location).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryRows])

  const statusOptions = ['In Stock', 'Low Stock', 'Reorder']

  const closeForm = () => {
    if (isSaving) {
      return
    }
    setIsFormOpen(false)
    setFormError(null)
  }

  const saveItem = async () => {
    const endpoint = import.meta.env.VITE_UPSERT_INVENTORY_URL
    if (!endpoint) {
      setFormError(
        'Missing upsert endpoint. Set VITE_UPSERT_INVENTORY_URL in the environment.',
      )
      return
    }

    if (!formValues.id.trim()) {
      setFormError('Item ID is required.')
      return
    }

    if (!formValues.name.trim()) {
      setFormError('Item name is required.')
      return
    }

    setIsSaving(true)
    setFormError(null)

    const consumptionRules = buildConsumptionRules(formValues)

    const payload = {
      id: formValues.id.trim(),
      'Item name': formValues.name.trim(),
      Location: formValues.location.trim(),
      Status: formValues.status.trim(),
      Quantity: Number(formValues.quantity) || 0,
      'Last updated': formatDateForStorage(formValues.updated),
      rebuyQty: Number(formValues.rebuyQty) || 0,
      unitPrice: Number(formValues.unitPrice) || 0,
      Tolerance: Number(formValues.tolerance) || 0,
      consumptionRules: consumptionRules ?? undefined,
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

      const updatedRow: InventoryRow = {
        id: payload.id,
        name: payload['Item name'],
        location: payload.Location || '—',
        status: payload.Status || 'Unknown',
        quantity: payload.Quantity,
        updatedRaw: String(payload['Last updated'] ?? ''),
        updated: formatUpdatedDate(payload['Last updated']),
        rebuyQty: payload.rebuyQty,
        unitPrice: payload.unitPrice,
        tolerance: payload.Tolerance,
        consumptionRules: consumptionRules ?? null,
      }

      setInventoryRows((current) => {
        const existingIndex = current.findIndex((row) => row.id === payload.id)
        if (existingIndex >= 0) {
          const copy = [...current]
          copy[existingIndex] = updatedRow
          return copy
        }
        return [updatedRow, ...current]
      })

      setLastUpdated(
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )

      setIsFormOpen(false)
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
    const endpoint = import.meta.env.VITE_UPDATE_ALERT_STATUS_URL
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-title">Yalla!</span>
        </div>
        <nav className="nav">
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
          {navigation.map((group) => (
            <div className="nav-section" key={group.section}>
              <div className="nav-section-title">{group.section}</div>
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
            </div>
          ))}
        </nav>
      </aside>

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
                <button className="btn-secondary" type="button">
                  Export
                </button>
                <button className="btn-ghost" type="button" onClick={openNewItem}>
                  Add item
                </button>
                <button
                  className="btn-primary"
                  onClick={fetchInventory}
                  type="button"
                  disabled={isLoading}
                >
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </header>

            {error ? <div className="alert">{error}</div> : null}

            <section className="summary-cards">
              <div className="card card-compact">
                <p className="card-label">Total SKUs</p>
                <p className="card-value">{inventoryRows.length}</p>
                <p className="card-meta">Across all tracked locations</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Low Stock</p>
                <p className="card-value">{lowStockCount}</p>
                <p className="card-meta">Needs attention this week</p>
              </div>
              <div className="card card-compact">
                <p className="card-label">Last Sync</p>
                <p className="card-value">
                  {lastUpdated ?? 'Not synced yet'}
                </p>
                <p className="card-meta">Production DynamoDB</p>
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
                  <button
                    className={`btn-icon btn-icon-ghost btn-filter ${
                      isFilterOpen ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-label="Filters"
                    onClick={() => {
                      setFilterDraft({
                        locations: [...filters.locations],
                        statuses: [...filters.statuses],
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
                          setFilterDraft({ locations: [], statuses: [] })
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
                                onClick={() => openEditItem(row)}
                                aria-label="Edit item"
                              >
                                ✎
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
                                    {row.unitPrice || '—'}
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
          isChatbotConfigured ? (
            <ChatbotView />
          ) : (
            <section className="card">
              <h1 className="page-title">Chatbot</h1>
              <p className="subtitle">
                Chatbot is not configured in this environment yet.
              </p>
              <p className="chat-empty">
                Ensure the Amplify AI backend outputs are available in hosting.
              </p>
              <div className="chatbot-container">
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    const debugPanel = document.querySelector(
                      '[data-chatbot-debug]',
                    ) as HTMLDivElement | null
                    if (debugPanel) {
                      debugPanel.removeAttribute('data-hidden')
                      return
                    }
                  }}
                >
                  Show debug
                </button>
                <div data-chatbot-debug>
                  <ChatbotDebugPanel
                    debugInfo={{
                      outputsStatus: 'Not checked',
                      outputsKeys: [],
                      outputsHasData: false,
                      outputsHasAuth: false,
                      configKeys: Object.keys(Amplify.getConfig() ?? {}),
                      configHasData: Boolean(
                        (Amplify.getConfig() as { data?: unknown }).data,
                      ),
                      configHasAuth: Boolean(
                        (Amplify.getConfig() as { Auth?: { Cognito?: unknown } })
                          .Auth?.Cognito,
                      ),
                    }}
                  />
                </div>
              </div>
            </section>
          )
        ) : (
          <section className="card">
            <h1 className="page-title">{activePage}</h1>
            <p className="subtitle">
              {activePage === 'Chatbot' ? 'Chatbot' : 'Alerts'}
            </p>
          </section>
        )}

        {isFormOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal">
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
                <div className="form-grid">
                  <label className="form-field">
                    <span>Item ID</span>
                    <input
                      type="text"
                      value={formValues.id}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                      placeholder="INV-001"
                    />
                  </label>
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
                    <span>Location</span>
                    <input
                      type="text"
                      value={formValues.location}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          location: event.target.value,
                        }))
                      }
                      placeholder="Warehouse A"
                    />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Low Stock">Low Stock</option>
                      <option value="Reorder">Reorder</option>
                    </select>
                  </label>
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
                  <label className="form-field">
                    <span>Last updated</span>
                    <input
                      type="date"
                      value={formValues.updated}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          updated: event.target.value,
                        }))
                      }
                    />
                  </label>
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
                {formError ? <div className="alert">{formError}</div> : null}
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" type="button" onClick={closeForm}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={saveItem}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save item'}
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
