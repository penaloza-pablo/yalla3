import { SegmentedControl } from '../design/SegmentedControl'

type DomainTabsProps = {
  pages: string[]
  activePage: string
  onNavigate: (page: string) => void
  ariaLabel: string
  labelFor: (page: string) => string
}

export function DomainTabs({
  pages,
  activePage,
  onNavigate,
  ariaLabel,
  labelFor,
}: DomainTabsProps) {
  if (pages.length < 2) {
    return null
  }

  return (
    <div className="yl-domain-tabs">
      <SegmentedControl
        value={activePage}
        options={pages.map((page) => ({
          id: page,
          label: labelFor(page),
        }))}
        onChange={onNavigate}
        ariaLabel={ariaLabel}
      />
    </div>
  )
}
