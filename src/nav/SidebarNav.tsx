import { useEffect, useState } from 'react'
import type { NavGroup } from '../../amplify/functions/shared/rbac-catalog'
import { PAGE_ICON, YlIcon } from '../design/icons'

const COLLAPSED_SECTIONS_KEY = 'yalla.sidebar.collapsedSections.v1'

type SidebarNavProps = {
  coreItems: string[]
  groups: NavGroup[]
  activePage: string
  onNavigate: (page: string) => void
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
  page,
  activePage,
  onNavigate,
  labelForPage,
}: {
  page: string
  activePage: string
  onNavigate: (page: string) => void
  labelForPage: (page: string) => string
}) {
  const isActive = activePage === page
  return (
    <li>
      <button
        className={`nav-button ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        type="button"
        onClick={() => onNavigate(page)}
      >
        <span className="nav-button-label">
          <YlIcon
            name={PAGE_ICON[page] ?? 'list.bullet'}
            size={18}
            variant="regular"
          />
          <span>{labelForPage(page)}</span>
        </span>
      </button>
    </li>
  )
}

export function SidebarNav({
  coreItems,
  groups,
  activePage,
  onNavigate,
  labelForPage,
  labelForSection,
}: SidebarNavProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => readCollapsedSections(),
  )
  const activeSection = groups.find((group) =>
    group.items.includes(activePage),
  )?.section

  useEffect(() => {
    if (!activeSection) {
      return
    }
    setCollapsedSections((current) => {
      if (!current.has(activeSection)) {
        return current
      }
      const next = new Set(current)
      next.delete(activeSection)
      writeCollapsedSections(next)
      return next
    })
  }, [activePage, activeSection])

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

  return (
    <div className="sidebar-nav">
      {coreItems.length > 0 ? (
        <ul className="sidebar-nav-list sidebar-nav-root">
          {coreItems.map((item) => (
            <FeatureRow
              key={item}
              page={item}
              activePage={activePage}
              onNavigate={onNavigate}
              labelForPage={labelForPage}
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
                    page={item}
                    activePage={activePage}
                    onNavigate={onNavigate}
                    labelForPage={labelForPage}
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
