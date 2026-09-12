const PAGE_QUERY_KEY = 'page'

export const readPageFromLocation = (validPages: Set<string>): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const page = new URLSearchParams(window.location.search).get(PAGE_QUERY_KEY)?.trim()
  if (page && validPages.has(page)) {
    return page
  }
  return null
}

export const writePageToUrl = (
  page: string,
  mode: 'push' | 'replace' = 'replace',
) => {
  if (typeof window === 'undefined') {
    return
  }
  const url = new URL(window.location.href)
  if (url.searchParams.get(PAGE_QUERY_KEY) === page) {
    return
  }
  url.searchParams.set(PAGE_QUERY_KEY, page)
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === 'push') {
    window.history.pushState({ page }, '', next)
  } else {
    window.history.replaceState({ page }, '', next)
  }
}
