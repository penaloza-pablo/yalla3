const STORAGE_KEY = 'yalla.dismissedGuestyNameMismatches'

const uniqueNames = (names: string[]) =>
  [...new Set(names.map((name) => name.trim()).filter(Boolean))]

export const readDismissedGuestyNameMismatches = () => {
  if (typeof window === 'undefined') {
    return [] as string[]
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return [] as string[]
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return [] as string[]
    }
    return uniqueNames(
      parsed.filter((entry): entry is string => typeof entry === 'string'),
    )
  } catch {
    return [] as string[]
  }
}

export const rememberDismissedGuestyNameMismatches = (names: string[]) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(uniqueNames(names)),
    )
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}
