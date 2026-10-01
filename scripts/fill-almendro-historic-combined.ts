import { readFileSync } from 'node:fs'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import {
  EXTERNAL_PERIOD_EXCLUSIVE_END,
  actualSortKey,
  resolvePropertyByNickname,
  type NicknameCandidate,
} from '../amplify/functions/shared/finance-historic.ts'
import {
  mapCombinedHistoricRecord,
  mergeCombinedHistoricMonth,
  type MetricCorrection,
} from '../amplify/functions/shared/historic-metric-review.ts'
import {
  emptyActualItem,
  getHistoricItem,
  writeCurrentActual,
  type HistoricActualItem,
} from '../amplify/functions/shared/finance-historic-store.ts'
import { docClient } from '../amplify/functions/shared/visit-task-utils.ts'

type SourceRecord = {
  period?: string
  metrics?: Record<string, number | null>
  metricReview?: unknown
  flags?: string[]
}

const AUTHORIZED_FILES = [
  'almendro_historic_2025-01_2026-07.json',
  'rodas_historic_2026-01_2026-07.json',
  'mendizabal_historic_2026-05_2026-07.json',
  'esperanza_9_historic_2025-02_2026-07.json',
]

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

type PackageFile = {
  propertyNickname?: string
  schemaVersion?: string
  periodFrom?: string
  periodThrough?: string
  records?: SourceRecord[]
}

const main = async () => {
  const candidates = await readPropertyCandidates()
  const summaries = []
  for (const fileName of AUTHORIZED_FILES) {
    const file = JSON.parse(
      readFileSync(new URL(`../${fileName}`, import.meta.url), 'utf8'),
    ) as PackageFile
    const nickname = file.propertyNickname ?? ''
    if (file.schemaVersion !== 'yalla-historic-combined-v2') {
      throw new Error(`${fileName} no es yalla-historic-combined-v2.`)
    }
    const resolved = resolvePropertyByNickname(nickname, candidates)
    if (resolved.resolution === 'ambiguous' || resolved.resolution === 'missing') {
      throw new Error(`No se pudo resolver ${nickname}: ${resolved.resolution}.`)
    }
    const propertyId = resolved.property.id
    const records = [...(file.records ?? [])].sort((left, right) =>
      String(left.period).localeCompare(String(right.period)),
    )
    let inserted = 0
    let revised = 0
    let skipped = 0
    const highlights: Record<string, unknown>[] = []
    for (const record of records) {
      const period = record.period ?? ''
      if (!/^\d{4}-\d{2}$/.test(period) || period >= EXTERNAL_PERIOD_EXCLUSIVE_END) {
        throw new Error(`Periodo fuera del histórico importable: ${period}.`)
      }
      if (period < (file.periodFrom ?? period) || period > (file.periodThrough ?? period)) {
        throw new Error(`Periodo fuera del rango del archivo: ${period}.`)
      }
      if ('bookingCount' in (record.metrics ?? {})) {
        throw new Error(`${fileName} intenta escribir bookingCount.`)
      }
      const existing = await getHistoricItem(
        historicTable,
        propertyId,
        actualSortKey(period),
      )
      if (existing && existing.dataOrigin === 'yalla_native') {
        skipped += 1
        continue
      }
      if (existing && existing.dataOrigin !== 'legacy_excel') {
        throw new Error(`Origen no reconocido en ${nickname} ${period}.`)
      }
      const mapped = mapCombinedHistoricRecord({
        period,
        metrics: record.metrics,
        metricReview: record.metricReview,
      })
      const merged = mergeCombinedHistoricMonth({
        schemaVersion: file.schemaVersion,
        incoming: mapped,
        corrections:
          existing?.metricCorrections && typeof existing.metricCorrections === 'object'
            ? (existing.metricCorrections as Record<string, MetricCorrection>)
            : undefined,
      })
      const metrics = { ...asMetrics(existing?.metrics), ...merged.metrics }
      if ('bookingCount' in metrics && !existing) {
        delete metrics.bookingCount
      }
      const qualityFlags = [
        ...new Set([...asFlags(existing?.qualityFlags), ...(record.flags ?? [])]),
      ]
      const reviewCount = Object.values(merged.metricReview).filter(
        (entry) => entry.needsReview,
      ).length
      if (
        merged.conflicts.length > 0 ||
        metrics.expensesAndServicesGross != null ||
        reviewCount > 0
      ) {
        highlights.push({
          period,
          plan: existing ? 'revise' : 'insert',
          conflicts: merged.conflicts,
          expensesAndServicesGross: metrics.expensesAndServicesGross ?? null,
          needsReview: reviewCount,
          bookingCount: metrics.bookingCount ?? null,
        })
      }
      if (!execute) continue
      const provenance = {
        ...(existing?.provenance && typeof existing.provenance === 'object'
          ? (existing.provenance as Record<string, unknown>)
          : {}),
        combinedSchemaVersion: file.schemaVersion,
        combinedFile: fileName,
      }
      const item = existing
        ? {
            ...(existing as HistoricActualItem),
            metrics,
            metricReview: merged.metricReview,
            metricCorrections: merged.corrections,
            qualityFlags,
            provenance,
            updatedAt: new Date().toISOString(),
          }
        : emptyActualItem({
            propertyId,
            period,
            dataOrigin: 'legacy_excel',
            metrics,
            metricReview: merged.metricReview,
            metricCorrections: merged.corrections,
            qualityFlags,
            nickname,
            provenance,
            updatedAt: new Date().toISOString(),
          })
      const status = await writeCurrentActual(historicTable, item)
      if (status === 'insert') inserted += 1
      else if (status === 'revise') revised += 1
      else skipped += 1
    }
    summaries.push({
      fileName,
      nickname: resolved.property.nickname,
      propertyId,
      months: records.length,
      inserted,
      revised,
      skipped,
      highlights,
    })
  }
  console.log(JSON.stringify({ execute, summaries }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
