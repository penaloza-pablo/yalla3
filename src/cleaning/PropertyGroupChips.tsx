import { useTranslation } from 'react-i18next'
import { PROPERTY_GROUP_CHIPS } from './propertyGroups'
import type { CleaningBillingPropertyGroup } from './types'

type Props = {
  value: CleaningBillingPropertyGroup | ''
  onChange: (value: CleaningBillingPropertyGroup | '') => void
  groups?: CleaningBillingPropertyGroup[]
}

export function PropertyGroupChips({
  value,
  onChange,
  groups = PROPERTY_GROUP_CHIPS,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="property-group-chips">
      {groups.map((group) => {
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
