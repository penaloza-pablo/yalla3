export type JobSchedulerSeedTemplate = {
  name: string
  title: string
}

export type JobSchedulerSeedRule = {
  templateIds: string[]
}

const INITIAL_COMPLETED_TEMPLATES: Array<{
  name: string
  month: number
  day: number
  year?: number
}> = [
  { name: 'DEEP PC - Esperanza 14', month: 8, day: 31 },
  { name: 'DEEP PC - Mesón de Paredes', month: 8, day: 26 },
  { name: 'DEEP PC - Meson de Paredes', month: 8, day: 26 },
  { name: 'DEEP PC - San Marcos D', month: 8, day: 19 },
  { name: 'DEEP PC - San Marcos C', month: 8, day: 5 },
  { name: 'DEEP PC - Fe', month: 8, day: 4 },
  { name: 'P2 PC - Deep cleaning', month: 9, day: 9, year: 2026 },
  { name: 'P2 PC - 201', month: 9, day: 12 },
  { name: 'P2 PC - 202', month: 8, day: 1 },
  { name: 'P2 PC - 203', month: 9, day: 1 },
  { name: 'P2 PC - 204', month: 9, day: 1 },
  { name: 'P2 PC - 205', month: 8, day: 1 },
  { name: 'P2 PC - 206', month: 8, day: 1 },
  { name: 'P2 PC - 207', month: 9, day: 12 },
  { name: 'P2 PC - 208', month: 9, day: 1 },
  { name: 'P2 PC - 209', month: 9, day: 1 },
  { name: 'P2 PC - 210', month: 9, day: 12 },
  { name: 'P2 PC - 211', month: 8, day: 1 },
  { name: 'P2 PC - 212', month: 9, day: 12 },
]

const foldTemplateKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const templateMatchKeys = (value: string) => {
  const folded = foldTemplateKey(value)
  if (!folded) {
    return new Set<string>()
  }
  const keys = new Set<string>([folded])
  if (folded.startsWith('deep ')) {
    keys.add(folded.slice(5))
  } else {
    keys.add(`deep ${folded}`)
  }
  return keys
}

const dateForSeed = (
  month: number,
  day: number,
  today: string,
  year?: number,
) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  if (year) {
    return `${year}-${pad(month)}-${pad(day)}`
  }
  const currentYear = Number(today.slice(0, 4))
  const candidate = `${currentYear}-${pad(month)}-${pad(day)}`
  return candidate <= today
    ? candidate
    : `${currentYear - 1}-${pad(month)}-${pad(day)}`
}

export const seedCompletionForRule = (
  rule: JobSchedulerSeedRule,
  templatesById: Map<string, JobSchedulerSeedTemplate>,
  today: string,
) => {
  let best: { date: string; title: string } | null = null
  for (const templateId of rule.templateIds) {
    const template = templatesById.get(templateId)
    if (!template) {
      continue
    }
    const keys = new Set([
      ...templateMatchKeys(template.name),
      ...templateMatchKeys(template.title),
    ])
    for (const seed of INITIAL_COMPLETED_TEMPLATES) {
      const overlap = [...templateMatchKeys(seed.name)].some((key) =>
        keys.has(key),
      )
      if (!overlap) {
        continue
      }
      const date = dateForSeed(seed.month, seed.day, today, seed.year)
      const title = template.name || template.title || seed.name
      if (!best || date > best.date) {
        best = { date, title }
      }
    }
  }
  return best
}
