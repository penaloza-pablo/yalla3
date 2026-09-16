export const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export async function withLiveRetry<T>(
  task: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number; signal?: AbortSignal },
): Promise<T> {
  const attempts = options?.attempts ?? 6
  const baseDelayMs = options?.baseDelayMs ?? 700
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw lastError instanceof Error ? lastError : new Error('Aborted')
    }
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await wait(baseDelayMs * (attempt + 1))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('loadError')
}
