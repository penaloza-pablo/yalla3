import { useTranslation } from 'react-i18next'
import {
  LINEN_VALUES,
  linenMenuValuesForListing,
} from '../../amplify/functions/shared/bookings-planner'

const LINEN_BADGE_CLASS: Record<string, string> = {
  [LINEN_VALUES.NA]: 'status-neutral',
  [LINEN_VALUES.NO]: 'status-info',
  [LINEN_VALUES.YES]: 'status-success',
  [LINEN_VALUES.DOUBLE]: 'status-success',
  [LINEN_VALUES.SINGLE]: 'status-info',
}

export const linenBadgeLabel = (
  value: string,
  t: (key: string) => string,
) => {
  if (value === LINEN_VALUES.NA) {
    return 'n/a'
  }
  if (value === LINEN_VALUES.NO) {
    return 'no'
  }
  if (value === LINEN_VALUES.YES) {
    return t('bookingsPlan.linenYes')
  }
  if (value === LINEN_VALUES.DOUBLE) {
    return t('bookingsPlan.linenDouble')
  }
  if (value === LINEN_VALUES.SINGLE) {
    return t('bookingsPlan.linenSingle')
  }
  return t('bookingsPlan.linenUnknown')
}

export function LinenBadgeSelect({
  value,
  listingId,
  disabled,
  open,
  onToggle,
  onSelect,
}: {
  value: string
  listingId: string
  disabled?: boolean
  open: boolean
  onToggle: () => void
  onSelect: (linen: string) => void
}) {
  const { t } = useTranslation()
  const className = LINEN_BADGE_CLASS[value] ?? 'status-warning'
  const options = linenMenuValuesForListing(listingId)
  return (
    <div className="linen-badge-wrap">
      <button
        type="button"
        className={`status linen-badge ${className}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={onToggle}
      >
        {linenBadgeLabel(value, t)}
      </button>
      {open ? (
        <div className="linen-badge-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option || 'unknown'}
              type="button"
              className={`status linen-badge ${
                LINEN_BADGE_CLASS[option] ?? 'status-warning'
              } ${option === value ? 'is-selected' : ''}`}
              role="option"
              aria-selected={option === value}
              onClick={() => onSelect(option)}
            >
              {linenBadgeLabel(option, t)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
