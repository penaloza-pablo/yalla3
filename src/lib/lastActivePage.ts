const STORAGE_KEY = 'yalla.lastActivePage'
const OPS_DASHBOARD_KEY = 'yalla.openOpsDashboard'
const MAX_AGE_MS = 60 * 60 * 1000
const FALLBACK_PAGE = 'Daily Operations'

const LEGACY_PAGE_MAP: Record<string, string> = {
  Today: 'Daily Operations',
  Chatbot: 'Daily Operations',
}

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

const markOpenOpsDashboard = () => {
  try {
    window.sessionStorage.setItem(OPS_DASHBOARD_KEY, '1')
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

const resolvePage = (page: string) => {
  if (page === 'Today') {
    markOpenOpsDashboard()
  }
  return LEGACY_PAGE_MAP[page] ?? page
}

export const consumeOpenOpsDashboard = () => {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    const flag = window.sessionStorage.getItem(OPS_DASHBOARD_KEY)
    if (flag) {
      window.sessionStorage.removeItem(OPS_DASHBOARD_KEY)
    }
    return flag === '1'
  } catch {
    return false
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
  const page = resolvePage(stored.page)
  if (!validPages.has(page)) {
    return FALLBACK_PAGE
  }
  return page
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
