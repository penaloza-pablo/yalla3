export const humanizeRequestError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message) {
    return fallback
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return fallback
  }
  return message
}
