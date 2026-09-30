import { readFileSync } from 'node:fs'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import {
  HISTORIC_ACCOUNT_ID,
  HISTORIC_SCHEMA_VERSION,
  MAP_SORT_KEY,
  historicPropertyIdFor,
  mapSourceMetrics,
  partitionBenchmarks,
  partitionSnapshots,
  provenanceFromSource,
  resolvePropertyByNickname,
  sourcePartitionKey,
  type NicknameCandidate,
  type SourceBenchmark,
  type SourceSnapshot,
} from '../amplify/functions/shared/finance-historic.ts'
import {
  getPropertyMap,
  putBenchmark,
  putPropertyMap,
  writeCurrentActual,
  emptyActualItem,
} from '../amplify/functions/shared/finance-historic-store.ts'
import { docClient } from '../amplify/functions/shared/visit-task-utils.ts'

type PackageFile = {
  sourceSha256?: string
  snapshots?: SourceSnapshot[]
  benchmarks?: SourceBenchmark[]
}

const args = process.argv.slice(2)
const keys: string[] = []
let execute = false
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg === '--execute') execute = true
  if (arg === '--property-keys') {
    const value = args[index + 1] ?? ''
    keys.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
    index += 1
  }
}

const stamp = () => new Date().toISOString()
const historicTable = process.env.HISTORIC_TABLE || 'yalla-finance-historic'
const propertiesTable = process.env.PROPERTIES_TABLE || 'yalla-properties'

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
      candidates.push({
        id,
        nickname,
        active: item.active !== false,
      })
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined
  } while (exclusiveStartKey)
  return candidates
}

const main = async () => {
  const file = JSON.parse(
    readFileSync(new URL('../historic_input/yalla_performance_data.json', import.meta.url), 'utf8'),
  ) as PackageFile
  const snapshots = partitionSnapshots(file.snapshots ?? [], keys)
  const benchmarks = partitionBenchmarks(file.benchmarks ?? [], keys)
  const candidates = await readPropertyCandidates()
  const propertyNames = new Map<string, string>()
  for (const row of snapshots.accepted) {
    if (row.propertyName) propertyNames.set(row.propertyKey, row.propertyName)
  }
  const resolutions: Record<string, unknown>[] = []
  let createdProperties = 0
  for (const propertyKey of keys) {
    const existingMap = await getPropertyMap(historicTable, propertyKey).catch(
      () => null,
    )
    if (existingMap && typeof existingMap.yallaPropertyId === 'string') {
      resolutions.push({
        propertyKey,
        propertyId: existingMap.yallaPropertyId,
        resolution: 'mapped',
        nickname: existingMap.nickname ?? null,
      })
      continue
    }
    const target = propertyNames.get(propertyKey) || 'Almendro'
    const resolved = resolvePropertyByNickname(target, candidates)
    if (resolved.resolution === 'ambiguous') {
      console.log(
        JSON.stringify(
          {
            stopped: true,
            reason: 'ambiguous_nickname',
            propertyKey,
            candidateIds: resolved.candidates.map((candidate) => candidate.id),
          },
          null,
          2,
        ),
      )
      process.exitCode = 1
      return
    }
    if (resolved.resolution !== 'missing') {
      resolutions.push({
        propertyKey,
        propertyId: resolved.property.id,
        resolution: resolved.resolution,
        nickname: resolved.property.nickname,
        active: resolved.property.active,
        created: false,
      })
      continue
    }
    const propertyId = historicPropertyIdFor(propertyKey)
    resolutions.push({
      propertyKey,
      propertyId,
      resolution: 'created_inactive',
      nickname: target,
      active: false,
      created: execute,
    })
    if (!execute) continue
    await docClient.send(
      new PutCommand({
        TableName: propertiesTable,
        Item: {
          id: propertyId,
          nickname: target,
          listingNickname: target,
          ListingNickname: target,
          title: target,
          active: false,
          ListingID: propertyId,
          historicOrigin: propertyKey,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    )
    await putPropertyMap(historicTable, {
      propertyId: sourcePartitionKey(propertyKey),
      sk: MAP_SORT_KEY,
      accountId: HISTORIC_ACCOUNT_ID,
      sourcePropertyKey: propertyKey,
      yallaPropertyId: propertyId,
      nickname: target,
      resolution: 'created_inactive',
      schemaVersion: HISTORIC_SCHEMA_VERSION,
      updatedAt: stamp(),
    })
    createdProperties += 1
  }

  const summary = {
    execute,
    historicTable,
    propertiesTable,
    acceptedMonths: snapshots.accepted.length,
    excludedByPeriod: snapshots.excludedByPeriod.length,
    outsideAllowlistMonths: snapshots.outsideAllowlist,
    acceptedBenchmarks: benchmarks.accepted.length,
    benchmarksOutside: benchmarks.outsideAllowlist,
    resolutions,
    createdProperties,
    inserted: 0,
    existing: 0,
    revised: 0,
    failed: 0,
    benchmarksInserted: 0,
    benchmarksExisting: 0,
  }

  if (!execute) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const byKey = new Map(
    resolutions.map((row) => [String(row.propertyKey), String(row.propertyId)]),
  )
  const writtenAt = stamp()
  for (const row of snapshots.accepted) {
    const propertyId = byKey.get(row.propertyKey)
    if (!propertyId) {
      summary.failed += 1
      continue
    }
    try {
      const status = await writeCurrentActual(
        historicTable,
        emptyActualItem({
          propertyId,
          period: row.period,
          dataOrigin: 'legacy_excel',
          metrics: mapSourceMetrics(row.metrics),
          qualityFlags: row.qualityFlags ?? [],
          propertyKey: row.propertyKey,
          nickname: row.propertyName,
          sourceSha256: file.sourceSha256,
          provenance: provenanceFromSource(row.source),
          updatedAt: writtenAt,
        }),
      )
      if (status === 'insert') summary.inserted += 1
      else if (status === 'revise') summary.revised += 1
      else summary.existing += 1
    } catch (error) {
      summary.failed += 1
      console.error(
        JSON.stringify({
          propertyKey: row.propertyKey,
          period: row.period,
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  for (const row of benchmarks.accepted) {
    const propertyId = byKey.get(row.propertyKey)
    if (!propertyId) continue
    const status = await putBenchmark(historicTable, propertyId, row.benchmarkKey, {
      accountId: HISTORIC_ACCOUNT_ID,
      benchmarkKey: row.benchmarkKey,
      label: row.benchmarkLabel ?? 'AirDNA',
      asOfDate: null,
      asOfDateLabel: row.asOfDateLabel ?? null,
      currency: 'EUR',
      amountUnit: 'major',
      schemaVersion: HISTORIC_SCHEMA_VERSION,
      dataOrigin: 'legacy_benchmark',
      metrics: mapSourceMetrics(row.metrics),
      qualityFlags: row.qualityFlags ?? [],
      provenance: provenanceFromSource(row.source),
      updatedAt: writtenAt,
    })
    if (status === 'insert') summary.benchmarksInserted += 1
    else summary.benchmarksExisting += 1
  }

  if (resolutions.some((row) => row.resolution !== 'mapped')) {
    for (const row of resolutions) {
      if (row.resolution === 'mapped' || row.resolution === 'created_inactive') {
        continue
      }
      await putPropertyMap(historicTable, {
        propertyId: sourcePartitionKey(String(row.propertyKey)),
        sk: MAP_SORT_KEY,
        accountId: HISTORIC_ACCOUNT_ID,
        sourcePropertyKey: row.propertyKey,
        yallaPropertyId: row.propertyId,
        nickname: row.nickname,
        resolution: row.resolution,
        schemaVersion: HISTORIC_SCHEMA_VERSION,
        updatedAt: writtenAt,
      }).catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.name === 'ConditionalCheckFailedException'
        ) {
          return
        }
        throw error
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
