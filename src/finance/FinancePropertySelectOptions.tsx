import { useTranslation } from 'react-i18next'
import {
  getPropertyLabel,
  partitionFinancePropertyOptions,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'

type Props = {
  properties: PropertyOption[]
}

export function FinancePropertySelectOptions({ properties }: Props) {
  const { t } = useTranslation()
  const { groups, listings, other } =
    partitionFinancePropertyOptions(properties)

  const option = (property: PropertyOption) => (
    <option key={property.id} value={property.id}>
      {getPropertyLabel(property)}
    </option>
  )

  return (
    <>
      {groups.length > 0 ? (
        <optgroup label={t('common.groups')}>{groups.map(option)}</optgroup>
      ) : null}
      {listings.length > 0 ? (
        <optgroup label={t('common.properties')}>
          {listings.map(option)}
        </optgroup>
      ) : null}
      {other.map(option)}
    </>
  )
}
