import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NavGroup } from '../../amplify/functions/shared/rbac-catalog'
import { PAGE_ICON, YlIcon, type YlIconName } from '../design/icons'
import {
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
  onNavigate,
  onTodayViewChange,
  labelForPage,
  labelForSection,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => readCollapsedSections(),
  )
  const showTodayViews = coreItems.includes('Daily Operations')
  const otherCoreItems = coreItems.filter((item) => item !== 'Daily Operations')
  const activeSection = groups.find((group) =>
    group.items.includes(activePage),
  )?.section
  const todaySectionActive = activePage === 'Daily Operations'

  useEffect(() => {
    if (!activeSection && !todaySectionActive) {
      return
    }
    const sectionToOpen = todaySectionActive ? TODAY_SECTION_ID : activeSection
    if (!sectionToOpen) {
      return
    }
    setCollapsedSections((current) => {
      if (!current.has(sectionToOpen)) {
        return current
      }
      const next = new Set(current)
      next.delete(sectionToOpen)
      writeCollapsedSections(next)
      return next
    })
  }, [activePage, activeSection, todaySectionActive])

  const toggleSection = (section: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      writeCollapsedSections(next)
      return next
    })
  }

  const todayOpen = !collapsedSections.has(TODAY_SECTION_ID)

  return (
    <div className="sidebar-nav">
      {showTodayViews ? (
        <div className="sidebar-nav-group sidebar-nav-root">
          <button
            type="button"
            className={`sidebar-nav-header ${todayOpen ? '' : 'is-collapsed'}`}
            aria-expanded={todayOpen}
            aria-controls="sidebar-section-today"
            onClick={() => toggleSection(TODAY_SECTION_ID)}
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
              {TODAY_NAV_ITEMS.map((item) => (
                <FeatureRow
                  key={item.view}
                  label={t(item.labelKey)}
                  icon={item.icon}
                  isActive={todaySectionActive && todayView === item.view}
                  onClick={() => onTodayViewChange(item.view)}
                />
              ))}
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
              onClick={() => toggleSection(group.section)}
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
