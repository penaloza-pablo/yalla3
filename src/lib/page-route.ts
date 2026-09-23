import {
  DEFAULT_TODAY_VIEW,
  parseTodayView,
  TODAY_VIEW_QUERY_KEY,
  type TodayViewMode,
} from '../nav/todayViews'

const PAGE_QUERY_KEY = 'page'

const PAGE_ALIASES: Record<string, string> = {
  Agents: 'Agent Catalog',
}

export const readPageFromLocation = (validPages: Set<string>): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = new URLSearchParams(window.location.search).get(PAGE_QUERY_KEY)?.trim()
  const page = raw ? (PAGE_ALIASES[raw] ?? raw) : ''
  if (page && validPages.has(page)) {
    return page
  }
  return null
}

export const readTodayViewFromLocation = (): TodayViewMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_TODAY_VIEW
  }
  return parseTodayView(
    new URLSearchParams(window.location.search).get(TODAY_VIEW_QUERY_KEY),
  )
}

export const writePageToUrl = (
  page: string,
  mode: 'push' | 'replace' = 'replace',
  extras?: { view?: TodayViewMode | null },
) => {
  if (typeof window === 'undefined') {
    return
  }
  const url = new URL(window.location.href)
  const currentPage = url.searchParams.get(PAGE_QUERY_KEY)
  const currentView = url.searchParams.get(TODAY_VIEW_QUERY_KEY)
  const nextView =
    page === 'Daily Operations'
      ? extras && 'view' in extras
        ? extras.view && extras.view !== DEFAULT_TODAY_VIEW
          ? extras.view
          : null
        : currentView
      : null
  const viewUnchanged = (nextView || null) === (currentView || null)
  if (currentPage === page && viewUnchanged) {
    return
  }
  url.searchParams.set(PAGE_QUERY_KEY, page)
  if (nextView) {
    url.searchParams.set(TODAY_VIEW_QUERY_KEY, nextView)
  } else {
    url.searchParams.delete(TODAY_VIEW_QUERY_KEY)
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === 'push') {
    window.history.pushState({ page, view: nextView }, '', next)
  } else {
    window.history.replaceState({ page, view: nextView }, '', next)
  }
}
