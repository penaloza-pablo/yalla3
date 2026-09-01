const STORAGE_KEY = 'yalla.lastActivePage'
const MAX_AGE_MS = 60 * 60 * 1000
const FALLBACK_PAGE = 'Today'

type StoredPage = {
  page: string
  at: number
}

const readStored = (): StoredPage | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as StoredPage
    if (!parsed?.page || typeof parsed.at !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const readRememberedPage = (validPages: Set<string>) => {
  if (typeof window === 'undefined') {
    return FALLBACK_PAGE
  }
  const stored = readStored()
  if (!stored) {
    return FALLBACK_PAGE
  }
  if (Date.now() - stored.at > MAX_AGE_MS) {
    return FALLBACK_PAGE
  }
  if (!validPages.has(stored.page)) {
    return FALLBACK_PAGE
  }
  return stored.page
}

export const rememberActivePage = (page: string) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ page, at: Date.now() } satisfies StoredPage),
    )
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}
