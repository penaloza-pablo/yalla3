import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NavGroup } from '../../amplify/functions/shared/rbac-catalog'
import {
  DEFAULT_NAV_MODE,
  type NavMode,
} from '../../amplify/functions/shared/nav-mode'
import { PAGE_ICON, YlIcon, type YlIconName } from '../design/icons'
import {
  canAccessTodayView,
  TODAY_NAV_ITEMS,
  TODAY_SECTION_ID,
  type TodayViewMode,
} from './todayViews'

const COLLAPSED_SECTIONS_KEY = 'yalla.sidebar.collapsedSections.v1'

type SidebarNavProps = {
  coreItems: string[]
  groups: NavGroup[]
  activePage: string
  todayView: TodayViewMode
  navMode?: NavMode
  visibleTodayViews?: TodayViewMode[]
  onNavigate: (page: string) => void
  onTodayViewChange: (view: TodayViewMode) => void
  labelForPage: (page: string) => string
  labelForSection: (section: string) => string
}

function readCollapsedSections(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_SECTIONS_KEY)
    if (!raw) {
      return new Set()
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return new Set()
    }
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

function writeCollapsedSections(sections: Set<string>) {
  try {
    window.localStorage.setItem(
      COLLAPSED_SECTIONS_KEY,
      JSON.stringify([...sections]),
    )
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function FeatureRow({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string
  icon: YlIconName
  isActive: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        className={`nav-button ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        type="button"
        onClick={onClick}
      >
        <span className="nav-button-label">
          <YlIcon name={icon} size={18} variant="regular" />
          <span>{label}</span>
        </span>
      </button>
    </li>
  )
}

export function SidebarNav({
  coreItems,
  groups,
  activePage,
  todayView,
  navMode = DEFAULT_NAV_MODE,
  visibleTodayViews,
  onNavigate,
  onTodayViewChange,
  labelForPage,
  labelForSection,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => readCollapsedSections(),
  )
  const pendingScrollPin = useRef<{
    scroller: HTMLElement
    header: HTMLElement
    top: number
  } | null>(null)
  const showTodayViews = coreItems.includes('Daily Operations')
  const otherCoreItems = coreItems.filter((item) => item !== 'Daily Operations')
  const todayItems = TODAY_NAV_ITEMS.filter(
    (item) =>
      !visibleTodayViews || canAccessTodayView(item.view, visibleTodayViews),
  )
  const activeSection = groups.find((group) =>
    group.items.includes(activePage),
  )?.section
  const todaySectionActive = activePage === 'Daily Operations'
  const isFlat = navMode === 'flat'
  const sectionIds = [
    ...(showTodayViews ? [TODAY_SECTION_ID] : []),
    ...groups.map((group) => group.section),
  ]
  const sectionIdsKey = sectionIds.join('|')

  useLayoutEffect(() => {
    const pending = pendingScrollPin.current
    if (!pending) {
      return
    }
    pendingScrollPin.current = null
    const delta = pending.header.getBoundingClientRect().top - pending.top
    if (delta !== 0) {
      pending.scroller.scrollTop += delta
    }
  }, [collapsedSections])

  useEffect(() => {
    if (isFlat || (!activeSection && !todaySectionActive)) {
      return
    }
    const sectionToOpen = todaySectionActive ? TODAY_SECTION_ID : activeSection
    if (!sectionToOpen) {
      return
    }
    const ids = sectionIdsKey ? sectionIdsKey.split('|') : []
    setCollapsedSections((current) => {
      const next = new Set(ids)
      next.delete(sectionToOpen)
      const unchanged = ids.every((id) => next.has(id) === current.has(id))
      if (unchanged) {
        return current
      }
      writeCollapsedSections(next)
      return next
    })
  }, [activePage, activeSection, isFlat, sectionIdsKey, todaySectionActive])

  const toggleSection = (section: string, header: HTMLButtonElement) => {
    const scroller = header.closest('.nav')
    if (scroller instanceof HTMLElement) {
      pendingScrollPin.current = {
        scroller,
        header,
        top: header.getBoundingClientRect().top,
      }
    }
    setCollapsedSections((current) => {
      const opening = current.has(section)
      const next = new Set(sectionIds)
      if (opening) {
        next.delete(section)
      }
      writeCollapsedSections(next)
      return next
    })
  }

  const todayOpen = !collapsedSections.has(TODAY_SECTION_ID)
  const todayRows = showTodayViews
    ? todayItems.map((item) => (
        <FeatureRow
          key={item.view}
          label={t(item.labelKey)}
          icon={item.icon}
          isActive={todaySectionActive && todayView === item.view}
          onClick={() => onTodayViewChange(item.view)}
        />
      ))
    : []
  const pageRows = [...otherCoreItems, ...groups.flatMap((group) => group.items)].map(
    (item) => (
      <FeatureRow
        key={item}
        label={labelForPage(item)}
        icon={PAGE_ICON[item] ?? 'list.bullet'}
        isActive={activePage === item}
        onClick={() => onNavigate(item)}
      />
    ),
  )

  if (isFlat) {
    return (
      <div className="sidebar-nav">
        <ul className="sidebar-nav-list sidebar-nav-root">
          {todayRows}
          {pageRows}
        </ul>
      </div>
    )
  }

  return (
    <div className="sidebar-nav">
      {todayRows.length > 0 ? (
        <div className="sidebar-nav-group sidebar-nav-root">
          <button
            type="button"
            className={`sidebar-nav-header ${todayOpen ? '' : 'is-collapsed'}`}
            aria-expanded={todayOpen}
            aria-controls="sidebar-section-today"
            onClick={(event) =>
              toggleSection(TODAY_SECTION_ID, event.currentTarget)
            }
          >
            <YlIcon
              name={todayOpen ? 'chevron.down' : 'chevron.right'}
              size={12}
              variant="regular"
            />
            <span>{labelForPage('Daily Operations')}</span>
          </button>
          {todayOpen ? (
            <ul className="sidebar-nav-list" id="sidebar-section-today">
              {todayRows}
            </ul>
          ) : null}
        </div>
      ) : null}
      {otherCoreItems.length > 0 ? (
        <ul className="sidebar-nav-list sidebar-nav-root">
          {otherCoreItems.map((item) => (
            <FeatureRow
              key={item}
              label={labelForPage(item)}
              icon={PAGE_ICON[item] ?? 'list.bullet'}
              isActive={activePage === item}
              onClick={() => onNavigate(item)}
            />
          ))}
        </ul>
      ) : null}
      {groups.map((group) => {
        const isOpen = !collapsedSections.has(group.section)
        const sectionId = `sidebar-section-${group.section}`
        return (
          <div className="sidebar-nav-group" key={group.section}>
            <button
              type="button"
              className={`sidebar-nav-header ${isOpen ? '' : 'is-collapsed'}`}
              aria-expanded={isOpen}
              aria-controls={sectionId}
              onClick={(event) =>
                toggleSection(group.section, event.currentTarget)
              }
            >
              <YlIcon
                name={isOpen ? 'chevron.down' : 'chevron.right'}
                size={12}
                variant="regular"
              />
              <span>{labelForSection(group.section)}</span>
            </button>
            {isOpen ? (
              <ul className="sidebar-nav-list" id={sectionId}>
                {group.items.map((item) => (
                  <FeatureRow
                    key={item}
                    label={labelForPage(item)}
                    icon={PAGE_ICON[item] ?? 'list.bullet'}
                    isActive={activePage === item}
                    onClick={() => onNavigate(item)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
