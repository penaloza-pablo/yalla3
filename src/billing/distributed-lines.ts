export type DistributedLineRef = {
  id: string
  distributionId?: string
}

export type DistributedDisplayRow<T extends DistributedLineRef> =
  | { kind: 'line'; line: T }
  | { kind: 'distribution'; id: string; members: T[] }

export const groupDistributedRows = <T extends DistributedLineRef>(
  allLines: T[],
  visibleLines: T[],
): DistributedDisplayRow<T>[] => {
  const membersByDistribution = new Map<string, T[]>()
  for (const line of allLines) {
    const distributionId = line.distributionId?.trim()
    if (!distributionId) {
      continue
    }
    const members = membersByDistribution.get(distributionId)
    if (members) {
      members.push(line)
    } else {
      membersByDistribution.set(distributionId, [line])
    }
  }

  const emitted = new Set<string>()
  const rows: DistributedDisplayRow<T>[] = []
  for (const line of visibleLines) {
    const distributionId = line.distributionId?.trim()
    if (!distributionId) {
      rows.push({ kind: 'line', line })
      continue
    }
    if (emitted.has(distributionId)) {
      continue
    }
    emitted.add(distributionId)
    const members = membersByDistribution.get(distributionId) ?? [line]
    if (members.length < 2) {
      rows.push({ kind: 'line', line: members[0] ?? line })
      continue
    }
    rows.push({ kind: 'distribution', id: distributionId, members })
  }
  return rows
}

export const distributionTotal = (members: Array<{ price: number | null }>) =>
  Math.round(
    members.reduce((sum, member) => sum + (member.price ?? 0), 0) * 100,
  ) / 100
