import { useTranslation } from 'react-i18next'
import {
  EARLY_CHECK_IN_MODES,
  type EarlyCheckInMode,
} from '../../amplify/functions/shared/bookings-planner'

const MODE_BADGE_CLASS: Record<EarlyCheckInMode, string> = {
  early: 'status-warning',
  do_not: 'status-danger',
  none: 'status-neutral',
}

export const earlyCheckInModeLabel = (
  mode: EarlyCheckInMode,
  t: (key: string) => string,
) => {
  if (mode === 'early') {
    return t('bookingsPlan.earlyCheckIn')
  }
  if (mode === 'do_not') {
    return t('bookingsPlan.doNotEarlyCheckIn')
  }
  return t('bookingsPlan.earlyCheckInNone')
}

export function EarlyCheckInBadgeSelect({
  value,
  disabled,
  open,
  onToggle,
  onSelect,
}: {
  value: EarlyCheckInMode
  disabled?: boolean
  open: boolean
  onToggle: () => void
  onSelect: (mode: EarlyCheckInMode) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="linen-badge-wrap early-check-in-badge-wrap">
      <button
        type="button"
        className={`status linen-badge ${MODE_BADGE_CLASS[value]}`}
        disabled={disabled}
        aria-expanded={open}
        aria-label={earlyCheckInModeLabel(value, t)}
        onClick={onToggle}
      >
        {earlyCheckInModeLabel(value, t)}
      </button>
      {open ? (
        <div className="linen-badge-menu early-check-in-badge-menu" role="listbox">
          {EARLY_CHECK_IN_MODES.map((option) => (
            <button
              key={option}
              type="button"
              className={`status linen-badge ${MODE_BADGE_CLASS[option]} ${
                option === value ? 'is-selected' : ''
              }`}
              role="option"
              aria-selected={option === value}
              onClick={() => onSelect(option)}
            >
              {earlyCheckInModeLabel(option, t)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
