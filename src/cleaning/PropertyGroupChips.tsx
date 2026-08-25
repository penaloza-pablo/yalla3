import { useTranslation } from 'react-i18next'
import { PROPERTY_GROUP_CHIPS } from './propertyGroups'
import type { CleaningBillingPropertyGroup } from './types'

type Props = {
  value: CleaningBillingPropertyGroup | ''
  onChange: (value: CleaningBillingPropertyGroup | '') => void
}

export function PropertyGroupChips({ value, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <div className="property-group-chips">
      {PROPERTY_GROUP_CHIPS.map((group) => {
        const isActive = value === group
        return (
          <button
            key={group}
            type="button"
            className={`btn-quick-filter ${isActive ? 'is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? '' : group)}
          >
            {t(`common.propertyChip.${group}`)}
          </button>
        )
      })}
    </div>
  )
}
