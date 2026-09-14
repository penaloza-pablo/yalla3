import { fetchJson } from '../operations/api'

export type CognitoUserOption = {
  email: string
  name: string
}

export const mapCognitoUserOption = (
  item: Record<string, unknown>,
): CognitoUserOption | null => {
  const email = String(item.email ?? '').trim().toLowerCase()
  if (!email) {
    return null
  }
  const name = String(item.name ?? '').trim()
  return { email, name: name || email }
}

export const loadCognitoUserOptions = async (endpoint: string) => {
  const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
    endpoint,
  )
  return (payload.items ?? [])
    .map(mapCognitoUserOption)
    .filter((entry): entry is CognitoUserOption => Boolean(entry))
}

export const cognitoUserLabel = (user: CognitoUserOption) =>
  user.name && user.name !== user.email
    ? `${user.name} (${user.email})`
    : user.email

export const withSelectedCognitoUser = (
  users: CognitoUserOption[],
  selectedEmail: string,
  selectedName?: string,
) => {
  const email = selectedEmail.trim().toLowerCase()
  if (!email || users.some((user) => user.email === email)) {
    return users
  }
  return [{ email, name: selectedName?.trim() || email }, ...users]
}
