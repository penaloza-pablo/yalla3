import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { getPropertyLabel } from '../operations/propertyHelpers'
import { resolveYallaPropertyLabel } from '../../amplify/functions/shared/property-identity'
import type { PropertyOption } from '../operations/types'
import type {
  AmenityRule,
  AmenityRuleType,
  CleanerRecord,
  PropertyCleaningDetailsRecord,
  PropertyCleaningType,
} from './types'
import { AMENITY_RULE_TYPES } from './types'
import { StarRating } from './StarRating'
import { YlIcon } from '../design/icons'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

type SettingsSection = 'cleaners' | 'propertyDetails' | 'amenities' | 'gap'

type TypeDraft = {
  id: string
  name: string
  price: string
  durationHours: string
  isDefault: boolean
}

const emptyCleanerForm = () => ({
  id: '',
  name: '',
  active: true,
})

type AmenityDraft = {
  inventoryId: string
  type: AmenityRuleType
  n: string
  soloQty: string
  groupQty: string
  gapQty: string
}

type InventoryOption = {
  id: string
  name: string
}

const emptyAmenityDraft = (): AmenityDraft => ({
  inventoryId: '',
  type: 'per_reservation',
  n: '1',
  soloQty: '1',
  groupQty: '2',
  gapQty: '1',
})

const ruleToDraft = (rule: AmenityRule): AmenityDraft => ({
  inventoryId: rule.inventoryId,
  type: rule.booking.type,
  n: rule.booking.n == null ? '' : String(rule.booking.n),
  soloQty: rule.booking.soloQty == null ? '' : String(rule.booking.soloQty),
  groupQty: rule.booking.groupQty == null ? '' : String(rule.booking.groupQty),
  gapQty: String(rule.gapQty),
})

const parseNonNegative = (value: string) => {
  const numeric = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null
  }
  return numeric
}

const draftsToRules = (drafts: AmenityDraft[]): AmenityRule[] | null => {
  const rules: AmenityRule[] = []
  const seen = new Set<string>()
  for (const draft of drafts) {
    const inventoryId = draft.inventoryId.trim()
    if (!inventoryId || seen.has(inventoryId)) {
      return null
    }
    seen.add(inventoryId)
    const gapQty = parseNonNegative(draft.gapQty)
    if (gapQty === null) {
      return null
    }
    if (draft.type === 'per_reservation' || draft.type === 'per_guest') {
      const n = parseNonNegative(draft.n)
      if (n === null) {
        return null
      }
      rules.push({ inventoryId, booking: { type: draft.type, n }, gapQty })
      continue
    }
    if (draft.type === 'solo_or_fixed') {
      const soloQty = parseNonNegative(draft.soloQty)
      const groupQty = parseNonNegative(draft.groupQty)
      if (soloQty === null || groupQty === null) {
        return null
      }
      rules.push({
        inventoryId,
        booking: { type: draft.type, soloQty, groupQty },
        gapQty,
      })
      continue
    }
    const n = parseNonNegative(draft.n)
    const soloQty = parseNonNegative(draft.soloQty)
    if (n === null || soloQty === null) {
      return null
    }
    rules.push({
      inventoryId,
      booking: { type: draft.type, n, soloQty },
      gapQty,
    })
  }
  return rules
}

const mapAmenityRule = (item: Record<string, unknown>): AmenityRule | null => {
  const inventoryId = String(item.inventoryId ?? '').trim()
  const booking = (item.booking ?? {}) as Record<string, unknown>
  const type = String(booking.type ?? '') as AmenityRuleType
  if (!inventoryId || !AMENITY_RULE_TYPES.includes(type)) {
    return null
  }
  const gapQty = Number(item.gapQty)
  if (!Number.isFinite(gapQty) || gapQty < 0) {
    return null
  }
  return {
    inventoryId,
    booking: {
      type,
      n: Number.isFinite(Number(booking.n)) ? Number(booking.n) : undefined,
      soloQty: Number.isFinite(Number(booking.soloQty))
        ? Number(booking.soloQty)
        : undefined,
      groupQty: Number.isFinite(Number(booking.groupQty))
        ? Number(booking.groupQty)
        : undefined,
    },
    gapQty,
  }
}

const toNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const mapCleaner = (item: Record<string, unknown>): CleanerRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
  cleaningsCount: toNumber(item.cleaningsCount),
  incidentsCount: toNumber(item.incidentsCount),
  uniqueIncidentVisitCount: toNumber(item.uniqueIncidentVisitCount),
  historicalRating: toNumber(item.historicalRating),
  trendRating: toNumber(item.trendRating),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const mapCleaningType = (item: Record<string, unknown>): PropertyCleaningType => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? ''),
  price: Number(item.price ?? 0),
  durationHours: Number(item.durationHours ?? 0),
  isDefault: Boolean(item.isDefault),
})

const mapDetails = (
  item: Record<string, unknown>,
): PropertyCleaningDetailsRecord => ({
  id: String(item.id ?? item.propertyId ?? ''),
  propertyId: String(item.propertyId ?? item.id ?? ''),
  nickname: resolveYallaPropertyLabel({
    id: String(item.propertyId ?? item.id ?? ''),
    nickname: String(item.nickname ?? item.propertyId ?? item.id ?? ''),
  }),
  cleaningTypes: Array.isArray(item.cleaningTypes)
    ? (item.cleaningTypes as Record<string, unknown>[]).map(mapCleaningType)
    : [],
  amenitiesRules: Array.isArray(item.amenitiesRules)
    ? (item.amenitiesRules as Record<string, unknown>[])
        .map(mapAmenityRule)
        .filter((rule): rule is AmenityRule => Boolean(rule))
    : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const formatDuration = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '—'
  }
  return `${hours}`.replace('.', ',')
}

const formatPrice = (price: number) => {
  if (!Number.isFinite(price)) {
    return '—'
  }
  return `${price}€`
}

const emptyTypeDraft = (isDefault = false): TypeDraft => ({
  id: '',
  name: '',
  price: '',
  durationHours: '',
  isDefault,
})

const typesToDrafts = (types: PropertyCleaningType[]): TypeDraft[] => {
  if (types.length === 0) {
    return [emptyTypeDraft(true)]
  }
  return types.map((type) => ({
    id: type.id,
    name: type.name,
    price: Number.isFinite(type.price) ? String(type.price) : '',
    durationHours: Number.isFinite(type.durationHours)
      ? String(type.durationHours)
      : '',
    isDefault: type.isDefault,
  }))
}

export function CleaningSettingsView({ getEndpoint, propertyOptions }: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getCleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
      upsertCleaner: getEndpoint(
        'upsertCleanerUrl',
        import.meta.env.VITE_UPSERT_CLEANER_URL,
      ),
      getDetails: getEndpoint(
        'getPropertyCleaningDetailsUrl',
        import.meta.env.VITE_GET_PROPERTY_CLEANING_DETAILS_URL,
      ),
      upsertDetails: getEndpoint(
        'upsertPropertyCleaningDetailsUrl',
        import.meta.env.VITE_UPSERT_PROPERTY_CLEANING_DETAILS_URL,
      ),
      getInventory: getEndpoint(
        'getInventoryUrl',
        import.meta.env.VITE_GET_INVENTORY_URL,
      ),
      properties: getEndpoint(
        'getPropertiesUrl',
        import.meta.env.VITE_GET_PROPERTIES_URL,
      ),
    }),
    [getEndpoint],
  )

  const [section, setSection] = useState<SettingsSection | null>(null)
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [details, setDetails] = useState<PropertyCleaningDetailsRecord[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>(propertyOptions)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCleanerFormOpen, setIsCleanerFormOpen] = useState(false)
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false)
  const [cleanerForm, setCleanerForm] = useState(emptyCleanerForm())
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [editingPropertyId, setEditingPropertyId] = useState('')
  const [typeDrafts, setTypeDrafts] = useState<TypeDraft[]>([emptyTypeDraft(true)])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [defaultConfirmOpen, setDefaultConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] =
    useState<PropertyCleaningDetailsRecord | null>(null)
  const [gapFreeNights, setGapFreeNights] = useState<number | null>(null)
  const [gapDraft, setGapDraft] = useState('')
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([])
  const [editingAmenitiesPropertyId, setEditingAmenitiesPropertyId] =
    useState('')
  const [amenityDrafts, setAmenityDrafts] = useState<AmenityDraft[]>([
    emptyAmenityDraft(),
  ])
  const [duplicateTargetId, setDuplicateTargetId] = useState('')

  const propertyById = useMemo(
    () =>
      new Map(
        properties.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [properties],
  )
  const configuredIds = useMemo(
    () => new Set(details.map((item) => item.propertyId)),
    [details],
  )
  const availableProperties = useMemo(
    () =>
      properties
        .filter((property) => property.id && !configuredIds.has(property.id))
        .sort((a, b) =>
          getPropertyLabel(a).localeCompare(getPropertyLabel(b), undefined, {
            sensitivity: 'base',
          }),
        ),
    [configuredIds, properties],
  )
  const editingDetails = details.find(
    (item) => item.propertyId === editingPropertyId,
  )
  const amenityProperties = useMemo(
    () =>
      details
        .filter((item) => item.amenitiesRules.length > 0)
        .sort((a, b) =>
          (propertyById.get(a.propertyId) || a.nickname).localeCompare(
            propertyById.get(b.propertyId) || b.nickname,
            undefined,
            { sensitivity: 'base' },
          ),
        ),
    [details, propertyById],
  )
  const editingAmenitiesDetails = details.find(
    (item) => item.propertyId === editingAmenitiesPropertyId,
  )
  const inventoryNameById = useMemo(
    () => new Map(inventoryOptions.map((item) => [item.id, item.name])),
    [inventoryOptions],
  )
  const sortedProperties = useMemo(
    () =>
      [...properties]
        .filter((property) => property.id)
        .sort((a, b) =>
          getPropertyLabel(a).localeCompare(getPropertyLabel(b), undefined, {
            sensitivity: 'base',
          }),
        ),
    [properties],
  )
  const duplicateTargets = useMemo(
    () =>
      sortedProperties.filter(
        (property) => property.id !== editingAmenitiesPropertyId,
      ),
    [editingAmenitiesPropertyId, sortedProperties],
  )
  const activeCleanersCount = cleaners.filter((cleaner) => cleaner.active).length

  const loadCleaners = useCallback(async () => {
    if (!endpoints.getCleaners) {
      setError(t('cleaningSettings.missingEndpoint'))
      return
    }
    if (endpoints.upsertCleaner) {
      try {
        await fetchJson(endpoints.upsertCleaner, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'reconcileStats' }),
        })
      } catch {
        // Keep loading cleaners even if the backfill has not been deployed yet.
      }
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getCleaners}?includeInactive=true`,
    )
    setCleaners((payload.items ?? []).map(mapCleaner))
  }, [endpoints.getCleaners, endpoints.upsertCleaner, t])

  const loadDetails = useCallback(async () => {
    if (!endpoints.getDetails) {
      return
    }
    const payload = await fetchJson<{
      items?: Record<string, unknown>[]
      settings?: { gapFreeNights?: number | null }
    }>(endpoints.getDetails)
    setDetails(
      (payload.items ?? [])
        .map(mapDetails)
        .filter(
          (item) => item.propertyId && item.propertyId !== 'GLOBAL',
        ),
    )
    const gap = payload.settings?.gapFreeNights
    const parsedGap =
      typeof gap === 'number' && Number.isInteger(gap) && gap >= 0 ? gap : null
    setGapFreeNights(parsedGap)
    setGapDraft(parsedGap === null ? '' : String(parsedGap))
  }, [endpoints.getDetails])

  const loadProperties = useCallback(async () => {
    if (!endpoints.properties) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.properties,
    )
    setProperties(
      (payload.items ?? []).map((item) => {
        const id = String(item.id ?? '')
        const nicknameRaw = String(
          item.nickname ?? item.Nickname ?? item.title ?? item.id ?? '',
        )
        const listingNickname = String(
          item.ListingNickname ?? item.listingNickname ?? '',
        )
        const title = String(item.title ?? '')
        return {
          id,
          nickname: resolveYallaPropertyLabel({
            id,
            nickname: nicknameRaw,
            listingNickname,
            title,
          }),
          title,
          listingNickname,
        }
      }),
    )
  }, [endpoints.properties])

  const loadInventory = useCallback(async () => {
    if (!endpoints.getInventory) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.getInventory,
    )
    const options = (payload.items ?? [])
      .map((item) => {
        const id = String(item.id ?? item.ID ?? '').trim()
        if (!id) {
          return null
        }
        const name = String(
          item['Item name'] ??
            item.name ??
            item.itemName ??
            item.Name ??
            id,
        )
        return { id, name }
      })
      .filter((item): item is InventoryOption => Boolean(item))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
    setInventoryOptions(options)
  }, [endpoints.getInventory])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await Promise.all([
        loadCleaners(),
        loadDetails(),
        loadProperties(),
        loadInventory(),
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadCleaners, loadDetails, loadInventory, loadProperties, t])

  useEffect(() => {
    setProperties(propertyOptions)
  }, [propertyOptions])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const openCreateCleaner = () => {
    setCleanerForm(emptyCleanerForm())
    setIsCleanerFormOpen(true)
    setMessage('')
    setError('')
  }

  const openEditCleaner = (cleaner: CleanerRecord) => {
    setCleanerForm({
      id: cleaner.id,
      name: cleaner.name,
      active: cleaner.active,
    })
    setIsCleanerFormOpen(true)
    setMessage('')
    setError('')
  }

  const saveCleaner = async () => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    if (!cleanerForm.name.trim()) {
      setError(t('cleaningSettings.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleanerForm.id || undefined,
          name: cleanerForm.name.trim(),
          active: cleanerForm.active,
        }),
      })
      setIsCleanerFormOpen(false)
      setMessage(
        cleanerForm.id
          ? t('cleaningSettings.updated')
          : t('cleaningSettings.created'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (cleaner: CleanerRecord) => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleaner.id,
          name: cleaner.name,
          active: !cleaner.active,
        }),
      })
      setMessage(
        cleaner.active
          ? t('cleaningSettings.deactivated')
          : t('cleaningSettings.activated'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveDetails = async (
    propertyId: string,
    nickname: string,
    types: TypeDraft[],
  ) => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return false
    }
    const cleaningTypes = types
      .map((draft) => ({
        id: draft.id || undefined,
        name: draft.name.trim(),
        price: Number(draft.price),
        durationHours: Number(String(draft.durationHours).replace(',', '.')),
        isDefault: draft.isDefault,
      }))
      .filter((type) => type.name)
    if (cleaningTypes.some((type) => !(type.durationHours > 0))) {
      setError(t('cleaningSettings.durationRequired'))
      return false
    }
    if (cleaningTypes.some((type) => !Number.isFinite(type.price) || type.price < 0)) {
      setError(t('cleaningSettings.priceRequired'))
      return false
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          nickname,
          cleaningTypes,
        }),
      })
      await loadDetails()
      return true
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const addProperty = async () => {
    if (!selectedPropertyId) {
      setError(t('cleaningSettings.propertyRequired'))
      return
    }
    const nickname =
      propertyById.get(selectedPropertyId) || selectedPropertyId
    const ok = await saveDetails(selectedPropertyId, nickname, [
      emptyTypeDraft(true),
    ])
    if (ok) {
      setIsAddPropertyOpen(false)
      setSelectedPropertyId('')
      setEditingPropertyId(selectedPropertyId)
      setTypeDrafts([emptyTypeDraft(true)])
      setMessage(t('cleaningSettings.propertyAdded'))
    }
  }

  const openEditDetails = (item: PropertyCleaningDetailsRecord) => {
    setEditingPropertyId(item.propertyId)
    setTypeDrafts(typesToDrafts(item.cleaningTypes))
    setIsAddPropertyOpen(false)
    setMessage('')
    setError('')
  }

  const openAmenitiesEditor = (propertyId: string) => {
    const current = details.find((item) => item.propertyId === propertyId)
    setEditingAmenitiesPropertyId(propertyId)
    setAmenityDrafts(
      current && current.amenitiesRules.length > 0
        ? current.amenitiesRules.map(ruleToDraft)
        : [emptyAmenityDraft()],
    )
    setDuplicateTargetId('')
    setMessage('')
    setError('')
  }

  const saveAmenities = async () => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return
    }
    if (!editingAmenitiesPropertyId) {
      setError(t('cleaningSettings.propertyRequired'))
      return
    }
    const rules =
      amenityDrafts.length === 0 ? [] : draftsToRules(amenityDrafts)
    if (!rules) {
      setError(t('cleaningSettings.amenitiesValidation'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsertAmenities',
          propertyId: editingAmenitiesPropertyId,
          nickname:
            editingAmenitiesDetails?.nickname ||
            propertyById.get(editingAmenitiesPropertyId) ||
            editingAmenitiesPropertyId,
          amenitiesRules: rules,
        }),
      })
      await loadDetails()
      setMessage(t('cleaningSettings.amenitiesSaved'))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const duplicateAmenities = async () => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return
    }
    if (!editingAmenitiesPropertyId || !duplicateTargetId) {
      setError(t('cleaningSettings.duplicatePropertyRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'duplicateAmenities',
          propertyId: editingAmenitiesPropertyId,
          targetPropertyId: duplicateTargetId,
        }),
      })
      const nextPropertyId = duplicateTargetId
      await loadDetails()
      setEditingAmenitiesPropertyId(nextPropertyId)
      setDuplicateTargetId('')
      setMessage(t('cleaningSettings.amenitiesDuplicated'))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const pendingDefaultTypeName = (() => {
    const named = typeDrafts.filter((draft) => draft.name.trim())
    return (
      named.find((draft) => draft.isDefault)?.name.trim() ||
      named[0]?.name.trim() ||
      ''
    )
  })()

  const saveEditingTypes = async (confirmed = false) => {
    if (!editingPropertyId) {
      return
    }
    const nickname =
      editingDetails?.nickname ||
      propertyById.get(editingPropertyId) ||
      editingPropertyId
    const named = typeDrafts.filter((draft) => draft.name.trim())
    if (named.length === 0) {
      setError(t('cleaningSettings.typeNameRequired'))
      return
    }
    if (
      named.some((draft) => {
        const duration = Number(String(draft.durationHours).replace(',', '.'))
        return !(duration > 0)
      })
    ) {
      setError(t('cleaningSettings.durationRequired'))
      return
    }
    if (
      named.some((draft) => {
        const price = Number(draft.price)
        return !Number.isFinite(price) || price < 0
      })
    ) {
      setError(t('cleaningSettings.priceRequired'))
      return
    }
    if (named.length > 1 && !confirmed) {
      setDefaultConfirmOpen(true)
      return
    }
    setDefaultConfirmOpen(false)
    const ok = await saveDetails(editingPropertyId, nickname, named)
    if (ok) {
      setEditingPropertyId('')
      setMessage(t('cleaningSettings.detailsUpdated'))
    }
  }

  const saveGap = async () => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return
    }
    const parsed = Number(gapDraft.trim())
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError(t('cleaningSettings.gapRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsertSettings',
          gapFreeNights: parsed,
        }),
      })
      setGapFreeNights(parsed)
      setGapDraft(String(parsed))
      setMessage(t('cleaningSettings.gapSaved'))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const removeProperty = async (item: PropertyCleaningDetailsRecord) => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          propertyId: item.propertyId,
        }),
      })
      if (editingPropertyId === item.propertyId) {
        setEditingPropertyId('')
      }
      setMessage(t('cleaningSettings.propertyRemoved'))
      await loadDetails()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const updateTypeDraft = (index: number, patch: Partial<TypeDraft>) => {
    setTypeDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== index) {
          if (patch.isDefault) {
            return { ...draft, isDefault: false }
          }
          return draft
        }
        return { ...draft, ...patch }
      }),
    )
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('cleaningSettings.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Cleaning settings')}</h1>
          </div>
          <p className="subtitle">{t('cleaningSettings.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void refreshAll()}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards cleaning-settings-cards">
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'cleaners' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'cleaners' ? null : 'cleaners',
            )
          }
        >
          <p className="card-label">{t('cleaningSettings.cleanersCard')}</p>
          <p className="card-value">{isLoading ? '—' : activeCleanersCount}</p>
          <p className="card-meta">{t('cleaningSettings.cleanersCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'propertyDetails' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'propertyDetails' ? null : 'propertyDetails',
            )
          }
        >
          <p className="card-label">{t('cleaningSettings.detailsCard')}</p>
          <p className="card-value">{isLoading ? '—' : details.length}</p>
          <p className="card-meta">{t('cleaningSettings.detailsCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'amenities' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'amenities' ? null : 'amenities',
            )
          }
        >
          <p className="card-label">{t('cleaningSettings.amenitiesCard')}</p>
          <p className="card-value">
            {isLoading ? '—' : amenityProperties.length}
          </p>
          <p className="card-meta">{t('cleaningSettings.amenitiesCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'gap' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) => (current === 'gap' ? null : 'gap'))
          }
        >
          <p className="card-label">{t('cleaningSettings.gapCard')}</p>
          <p className="card-value">
            {isLoading ? '—' : gapFreeNights === null ? '—' : gapFreeNights}
          </p>
          <p className="card-meta">{t('cleaningSettings.gapCardMeta')}</p>
        </button>
      </section>

      {section === 'cleaners' ? (
        <>
          {isCleanerFormOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {cleanerForm.id
                      ? t('cleaningSettings.editCleaner')
                      : t('cleaningSettings.addCleaner')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsCleanerFormOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                <label>
                  {t('cleaningSettings.name')}
                  <input
                    type="text"
                    value={cleanerForm.name}
                    onChange={(event) =>
                      setCleanerForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={cleanerForm.active}
                    onChange={(event) =>
                      setCleanerForm((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  {t('cleaningSettings.active')}
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveCleaner()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('cleaningSettings.cleanersCard')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.cleanersSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={openCreateCleaner}
              >
                {t('cleaningSettings.addCleaner')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('cleaningSettings.name')}</th>
                    <th>{t('cleaningSettings.status')}</th>
                    <th>{t('cleaningSettings.cleanings')}</th>
                    <th>{t('cleaningSettings.incidents')}</th>
                    <th>{t('cleaningSettings.historicalRating')}</th>
                    <th>{t('cleaningSettings.trendRating')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7}>{t('common.loading')}</td>
                    </tr>
                  ) : cleaners.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t('cleaningSettings.empty')}</td>
                    </tr>
                  ) : (
                    cleaners.map((cleaner) => (
                      <tr key={cleaner.id}>
                        <td>{cleaner.name}</td>
                        <td>
                          <span className={`tag ${cleaner.active ? '' : 'muted'}`}>
                            {cleaner.active
                              ? t('cleaningSettings.active')
                              : t('cleaningSettings.inactive')}
                          </span>
                        </td>
                        <td>{cleaner.cleaningsCount ?? 0}</td>
                        <td>{cleaner.incidentsCount ?? 0}</td>
                        <td>
                          <StarRating
                            value={
                              (cleaner.cleaningsCount ?? 0) > 0
                                ? cleaner.historicalRating
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <StarRating
                            value={
                              (cleaner.cleaningsCount ?? 0) > 0
                                ? cleaner.trendRating
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEditCleaner(cleaner)}
                            >
                              {t('cleaningSettings.edit')}
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void toggleActive(cleaner)}
                            >
                              {cleaner.active
                                ? t('cleaningSettings.deactivate')
                                : t('cleaningSettings.activate')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {section === 'propertyDetails' ? (
        <>
          {isAddPropertyOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {t('cleaningSettings.addProperty')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsAddPropertyOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                <label>
                  {t('cleaningSettings.property')}
                  <select
                    value={selectedPropertyId}
                    onChange={(event) =>
                      setSelectedPropertyId(event.target.value)
                    }
                  >
                    <option value="">
                      {t('cleaningSettings.selectProperty')}
                    </option>
                    {availableProperties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving || !selectedPropertyId}
                  onClick={() => void addProperty()}
                >
                  {isSaving ? t('common.saving') : t('cleaningSettings.addProperty')}
                </button>
              </div>
            </section>
          ) : null}

          {editingPropertyId ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {t('cleaningSettings.editTypes', {
                      property:
                        editingDetails?.nickname ||
                        propertyById.get(editingPropertyId) ||
                        editingPropertyId,
                    })}
                  </h2>
                  <p className="card-subtitle">
                    {t('cleaningSettings.editTypesSubtitle')}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setEditingPropertyId('')}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('cleaningSettings.typeName')}</th>
                      <th>{t('cleaningSettings.price')}</th>
                      <th>{t('cleaningSettings.duration')}</th>
                      <th>{t('cleaningSettings.defaultType')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeDrafts.map((draft, index) => (
                      <tr key={draft.id || `new-${index}`}>
                        <td>
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                name: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.price}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                price: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={draft.durationHours}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                durationHours: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={draft.isDefault}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                isDefault: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={typeDrafts.length === 1}
                            onClick={() =>
                              setTypeDrafts((current) => {
                                const next = current.filter(
                                  (_, draftIndex) => draftIndex !== index,
                                )
                                if (!next.some((entry) => entry.isDefault) && next[0]) {
                                  next[0] = { ...next[0], isDefault: true }
                                }
                                return next
                              })
                            }
                          >
                            {t('cleaningSettings.removeType')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() =>
                    setTypeDrafts((current) => [
                      ...current,
                      emptyTypeDraft(current.length === 0),
                    ])
                  }
                >
                  {t('cleaningSettings.addType')}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveEditingTypes()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('cleaningSettings.detailsCard')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.detailsSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setIsAddPropertyOpen(true)
                  setEditingPropertyId('')
                  setSelectedPropertyId('')
                  setMessage('')
                  setError('')
                }}
              >
                {t('cleaningSettings.addProperty')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('cleaningSettings.property')}</th>
                    <th>{t('cleaningSettings.types')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t('common.loading')}</td>
                    </tr>
                  ) : details.length === 0 ? (
                    <tr>
                      <td colSpan={3}>{t('cleaningSettings.emptyDetails')}</td>
                    </tr>
                  ) : (
                    details.map((item) => (
                      <tr key={item.propertyId}>
                        <td>
                          {propertyById.get(item.propertyId) || item.nickname}
                        </td>
                        <td>
                          {item.cleaningTypes.length === 0 ? (
                            <span className="card-meta">
                              {t('cleaningSettings.noTypes')}
                            </span>
                          ) : (
                            <ul className="cleaning-type-summary">
                              {item.cleaningTypes.map((type) => (
                                <li key={type.id}>
                                  <span>
                                    {type.name}: {formatPrice(type.price)},{' '}
                                    {t('cleaningSettings.durationValue', {
                                      hours: formatDuration(type.durationHours),
                                    })}
                                  </span>
                                  {type.isDefault ? (
                                    <span className="status status-info">
                                      {t('cleaningSettings.defaultBadge')}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-icon btn-icon-ghost"
                              type="button"
                              onClick={() => openEditDetails(item)}
                              aria-label={t('cleaningSettings.editTypesAction')}
                              title={t('cleaningSettings.editTypesAction')}
                            >
                              <YlIcon name="pencil" size={16} />
                            </button>
                            <button
                              className="btn-icon btn-icon-ghost"
                              type="button"
                              disabled={isSaving}
                              onClick={() => setPendingRemove(item)}
                              aria-label={t('cleaningSettings.removeProperty')}
                              title={t('cleaningSettings.removeProperty')}
                            >
                              <YlIcon name="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {section === 'amenities' ? (
        <>
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {editingAmenitiesPropertyId
                    ? t('cleaningSettings.editAmenities', {
                        property:
                          editingAmenitiesDetails?.nickname ||
                          propertyById.get(editingAmenitiesPropertyId) ||
                          editingAmenitiesPropertyId,
                      })
                    : t('cleaningSettings.amenitiesTitle')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.amenitiesSubtitle')}
                </p>
              </div>
              {editingAmenitiesPropertyId ? (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setEditingAmenitiesPropertyId('')
                    setDuplicateTargetId('')
                  }}
                >
                  {t('common.cancel')}
                </button>
              ) : null}
            </div>
            {!editingAmenitiesPropertyId ? (
              <div className="filters-grid">
                <label>
                  {t('cleaningSettings.property')}
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        openAmenitiesEditor(event.target.value)
                      }
                    }}
                  >
                    <option value="">
                      {t('cleaningSettings.selectProperty')}
                    </option>
                    {sortedProperties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('cleaningSettings.inventoryItem')}</th>
                        <th>{t('cleaningSettings.bookingRule')}</th>
                        <th>{t('cleaningSettings.ruleValues')}</th>
                        <th>{t('cleaningSettings.gapQty')}</th>
                        <th>{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amenityDrafts.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            {t('cleaningSettings.emptyAmenityDrafts')}
                          </td>
                        </tr>
                      ) : (
                      amenityDrafts.map((draft, index) => (
                        <tr key={`${draft.inventoryId}-${index}`}>
                          <td>
                            <select
                              value={draft.inventoryId}
                              onChange={(event) =>
                                setAmenityDrafts((current) =>
                                  current.map((entry, draftIndex) =>
                                    draftIndex === index
                                      ? {
                                          ...entry,
                                          inventoryId: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="">
                                {t('cleaningSettings.selectInventory')}
                              </option>
                              {inventoryOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.id})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={draft.type}
                              onChange={(event) =>
                                setAmenityDrafts((current) =>
                                  current.map((entry, draftIndex) =>
                                    draftIndex === index
                                      ? {
                                          ...entry,
                                          type: event.target
                                            .value as AmenityRuleType,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              {AMENITY_RULE_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {t(`cleaningSettings.ruleType.${type}`)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="amenities-rule-fields">
                              {draft.type === 'per_reservation' ||
                              draft.type === 'per_guest' ||
                              draft.type === 'solo_or_per_guest' ? (
                                <label>
                                  {t('cleaningSettings.ruleN')}
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={draft.n}
                                    onChange={(event) =>
                                      setAmenityDrafts((current) =>
                                        current.map((entry, draftIndex) =>
                                          draftIndex === index
                                            ? { ...entry, n: event.target.value }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                              {draft.type === 'solo_or_fixed' ||
                              draft.type === 'solo_or_per_guest' ? (
                                <label>
                                  {t('cleaningSettings.ruleSolo')}
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={draft.soloQty}
                                    onChange={(event) =>
                                      setAmenityDrafts((current) =>
                                        current.map((entry, draftIndex) =>
                                          draftIndex === index
                                            ? {
                                                ...entry,
                                                soloQty: event.target.value,
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                              {draft.type === 'solo_or_fixed' ? (
                                <label>
                                  {t('cleaningSettings.ruleGroup')}
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={draft.groupQty}
                                    onChange={(event) =>
                                      setAmenityDrafts((current) =>
                                        current.map((entry, draftIndex) =>
                                          draftIndex === index
                                            ? {
                                                ...entry,
                                                groupQty: event.target.value,
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={draft.gapQty}
                              onChange={(event) =>
                                setAmenityDrafts((current) =>
                                  current.map((entry, draftIndex) =>
                                    draftIndex === index
                                      ? { ...entry, gapQty: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() =>
                                setAmenityDrafts((current) =>
                                  current.filter(
                                    (_, draftIndex) => draftIndex !== index,
                                  ),
                                )
                              }
                            >
                              {t('cleaningSettings.removeType')}
                            </button>
                          </td>
                        </tr>
                      ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="page-action-bar" style={{ marginTop: 16 }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() =>
                      setAmenityDrafts((current) => [
                        ...current,
                        emptyAmenityDraft(),
                      ])
                    }
                  >
                    {t('cleaningSettings.addAmenity')}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveAmenities()}
                  >
                    {isSaving
                      ? t('common.saving')
                      : t('common.save')}
                  </button>
                </div>
                <div className="filters-grid" style={{ marginTop: 16 }}>
                  <label>
                    {t('cleaningSettings.duplicateTo')}
                    <select
                      value={duplicateTargetId}
                      onChange={(event) =>
                        setDuplicateTargetId(event.target.value)
                      }
                    >
                      <option value="">
                        {t('cleaningSettings.selectProperty')}
                      </option>
                      {duplicateTargets.map((property) => (
                        <option key={property.id} value={property.id}>
                          {getPropertyLabel(property)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="page-action-bar">
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={isSaving || !duplicateTargetId}
                      onClick={() => void duplicateAmenities()}
                    >
                      {t('cleaningSettings.duplicateAmenities')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('cleaningSettings.amenitiesListTitle')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.amenitiesListSubtitle')}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('cleaningSettings.property')}</th>
                    <th>{t('cleaningSettings.amenitiesCount')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t('common.loading')}</td>
                    </tr>
                  ) : amenityProperties.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        {t('cleaningSettings.emptyAmenities')}
                      </td>
                    </tr>
                  ) : (
                    amenityProperties.map((item) => (
                      <tr key={item.propertyId}>
                        <td>
                          {propertyById.get(item.propertyId) || item.nickname}
                        </td>
                        <td>
                          {item.amenitiesRules
                            .map(
                              (rule) =>
                                inventoryNameById.get(rule.inventoryId) ||
                                rule.inventoryId,
                            )
                            .join(', ')}
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => openAmenitiesEditor(item.propertyId)}
                          >
                            {t('cleaningSettings.edit')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {section === 'gap' ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('cleaningSettings.gapTitle')}</h2>
              <p className="card-subtitle">{t('cleaningSettings.gapSubtitle')}</p>
            </div>
          </div>
          <div className="filters-grid">
            <label>
              {t('cleaningSettings.gapFieldLabel')}
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={gapDraft}
                onChange={(event) => setGapDraft(event.target.value)}
              />
            </label>
          </div>
          <p className="card-subtitle" style={{ marginTop: 8 }}>
            {t('cleaningSettings.gapHelp')}
          </p>
          <div className="page-action-bar" style={{ marginTop: 16 }}>
            <button
              className="btn-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void saveGap()}
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </section>
      ) : null}

      {defaultConfirmOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {t('cleaningSettings.defaultGapConfirmTitle')}
                </h3>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setDefaultConfirmOpen(false)}
                aria-label={t('common.close')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                {t('cleaningSettings.defaultGapConfirmBody', {
                  typeName: pendingDefaultTypeName,
                })}
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setDefaultConfirmOpen(false)}
              >
                {t('common.back')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveEditingTypes(true)}
              >
                {isSaving
                  ? t('common.saving')
                  : t('cleaningSettings.confirmDefault')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRemove ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {t('cleaningSettings.removePropertyTitle')}
                </h3>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setPendingRemove(null)}
                aria-label={t('common.close')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                {t('cleaningSettings.removePropertyBody', {
                  property:
                    propertyById.get(pendingRemove.propertyId) ||
                    pendingRemove.nickname,
                })}
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setPendingRemove(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  const item = pendingRemove
                  setPendingRemove(null)
                  void removeProperty(item)
                }}
              >
                {isSaving
                  ? t('common.saving')
                  : t('cleaningSettings.removeProperty')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
