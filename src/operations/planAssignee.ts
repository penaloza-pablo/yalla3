export type LinkedOpsPerson = {
  id: string
  name: string
  cognitoEmail: string
  cognitoName: string
}

export const mapLinkedOpsPerson = (
  item: Record<string, unknown>,
): LinkedOpsPerson | null => {
  const id = String(item.id ?? item.userId ?? '').trim()
  if (!id) {
    return null
  }
  return {
    id,
    name: String(item.name ?? '').trim() || id,
    cognitoEmail: String(item.cognitoEmail ?? '').trim().toLowerCase(),
    cognitoName: String(item.cognitoName ?? '').trim(),
  }
}

export const yallaUserLabel = (person: LinkedOpsPerson | undefined) => {
  if (!person?.cognitoEmail) {
    return ''
  }
  return person.cognitoName || person.cognitoEmail
}

export const linkedPersonById = (items: Record<string, unknown>[]) =>
  new Map(
    items
      .map(mapLinkedOpsPerson)
      .filter((entry): entry is LinkedOpsPerson => Boolean(entry))
      .map((entry) => [entry.id, entry] as const),
  )
