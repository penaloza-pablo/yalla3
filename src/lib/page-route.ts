import {
  parseTodayView,
  TODAY_VIEW_QUERY_KEY,
  type TodayViewMode,
} from '../nav/todayViews'

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

export const readTodayViewFromLocation = (): TodayViewMode => {
  if (typeof window === 'undefined') {
    return 'dashboard'
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
      ? extras?.view && extras.view !== 'dashboard'
        ? extras.view
        : extras && 'view' in extras
          ? null
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
