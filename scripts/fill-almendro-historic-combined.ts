import { readFileSync } from 'node:fs'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import {
  EXTERNAL_PERIOD_EXCLUSIVE_END,
  amountToDecimalString,
  actualSortKey,
  resolvePropertyByNickname,
  type NicknameCandidate,
} from '../amplify/functions/shared/finance-historic.ts'
import {
  getHistoricItem,
  writeCurrentActual,
  type HistoricActualItem,
} from '../amplify/functions/shared/finance-historic-store.ts'
import { docClient } from '../amplify/functions/shared/visit-task-utils.ts'

const FIELD_MAP = {
  totalPaidByGuests: 'paidByGuest',
  cleaningFee: 'cleaningPaidByGuest',
  channelFee: 'channelFee',
  managementFee: 'managementFee',
  managementFeeVAT: 'managementFeeVat',
  netEarnings: 'netEarnings',
  calendarOccupiedNights: 'calendarOccupiedNights',
  calendarAveragePaidPerNight: 'calendarAveragePaidPerNight',
  calendarAverageGuestPaymentPerNightAfterCleaningFee:
    'calendarAveragePaidPerNightAfterCleaning',
  expensesAndServicesGross: 'expensesAndServicesGross',
} as const

type SourceRecord = {
  period?: string
  metrics?: Record<string, number | null>
  flags?: string[]
}

const historicTable = process.env.HISTORIC_TABLE || 'yalla-finance-historic'
const propertiesTable = process.env.PROPERTIES_TABLE || 'yalla-properties'
const execute = process.argv.includes('--execute')

const readPropertyCandidates = async () => {
  const candidates: NicknameCandidate[] = []
  let exclusiveStartKey: Record<string, unknown> | undefined
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: propertiesTable,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    for (const item of (result.Items as Record<string, unknown>[]) ?? []) {
      const id = typeof item.id === 'string' ? item.id : ''
      const nickname =
        typeof item.nickname === 'string'
          ? item.nickname
          : typeof item.ListingNickname === 'string'
            ? item.ListingNickname
            : ''
      candidates.push({ id, nickname, active: item.active !== false })
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined
  } while (exclusiveStartKey)
  return candidates
}

const asMetrics = (value: unknown) => {
  const metrics: Record<string, string | null> = {}
  if (!value || typeof value !== 'object') return metrics
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    metrics[key] = typeof entry === 'string' ? entry : null
  }
  return metrics
}

const asFlags = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []

const main = async () => {
  const file = JSON.parse(
    readFileSync(
      new URL('../almendro_historic_2025-01_2026-07.json', import.meta.url),
      'utf8',
    ),
  ) as {
    propertyNickname?: string
    periodFrom?: string
    periodThrough?: string
    records?: SourceRecord[]
  }
  if (file.propertyNickname !== 'Almendro') {
    throw new Error('El archivo no es el histórico de Almendro.')
  }
  const resolved = resolvePropertyByNickname(
    'Almendro',
    await readPropertyCandidates(),
  )
  if (resolved.resolution === 'ambiguous' || resolved.resolution === 'missing') {
    throw new Error(`No se pudo resolver Almendro: ${resolved.resolution}.`)
  }
  const propertyId = resolved.property.id
  const records = [...(file.records ?? [])].sort((left, right) =>
    String(left.period).localeCompare(String(right.period)),
  )
  const changes: Record<string, unknown>[] = []
  let revised = 0
  for (const record of records) {
    const period = record.period ?? ''
    if (!/^\d{4}-\d{2}$/.test(period) || period >= EXTERNAL_PERIOD_EXCLUSIVE_END) {
      throw new Error(`Periodo fuera del histórico importable: ${period}.`)
    }
    if (period < (file.periodFrom ?? period) || period > (file.periodThrough ?? period)) {
      throw new Error(`Periodo fuera del rango del archivo: ${period}.`)
    }
    const existing = await getHistoricItem(
      historicTable,
      propertyId,
      actualSortKey(period),
    )
    if (!existing || existing.dataOrigin !== 'legacy_excel') {
      throw new Error(`No hay cierre Excel de Almendro para ${period}.`)
    }
    const metrics = asMetrics(existing.metrics)
    if ('bookingCount' in (record.metrics ?? {})) {
      throw new Error('El archivo intenta escribir bookingCount.')
    }
    const before: Record<string, string | null> = {}
    const after: Record<string, string | null> = {}
    for (const [sourceKey, fieldId] of Object.entries(FIELD_MAP)) {
      const value = record.metrics?.[sourceKey]
      const next = value == null ? null : amountToDecimalString(value)
      before[fieldId] = Object.prototype.hasOwnProperty.call(metrics, fieldId)
        ? metrics[fieldId]
        : null
      after[fieldId] = next
      metrics[fieldId] = next
    }
    const qualityFlags = [
      ...new Set([...asFlags(existing.qualityFlags), ...(record.flags ?? [])]),
    ]
    changes.push({ period, before, after, qualityFlags })
    if (!execute) continue
    const status = await writeCurrentActual(historicTable, {
      ...(existing as HistoricActualItem),
      metrics,
      qualityFlags,
      updatedAt: new Date().toISOString(),
    })
    if (status !== 'revise' && status !== 'skip') {
      throw new Error(`Escritura inesperada en ${period}: ${status}.`)
    }
    if (status === 'revise') revised += 1
  }
  console.log(
    JSON.stringify(
      {
        execute,
        propertyId,
        nickname: resolved.property.nickname,
        months: records.length,
        revised,
        ignoredSourceField: 'checkInBookingCount',
        changes,
      },
      null,
      2,
    ),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
