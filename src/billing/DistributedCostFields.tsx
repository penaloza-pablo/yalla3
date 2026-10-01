import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { splitMoneyEvenly } from '../../amplify/functions/shared/split-money'
import { getPropertyLabel } from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'

type Props = {
  properties: PropertyOption[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  total: string
  onTotalChange: (value: string) => void
}

export function DistributedCostFields({
  properties,
  selectedIds,
  onSelectedIdsChange,
  total,
  onTotalChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )
  const selected = properties.filter((property) => selectedIds.includes(property.id))
  const numeric = Number(String(total).replace(',', '.'))
  const shares =
    Number.isFinite(numeric) && selected.length >= 2
      ? splitMoneyEvenly(numeric, selected.length)
      : []
  const uniqueShares = [...new Set(shares)].sort((left, right) => right - left)
  const high = uniqueShares[0]
  const low = uniqueShares[uniqueShares.length - 1]
  const preview =
    shares.length === 0 || high === undefined || low === undefined
      ? ''
      : high === low
        ? t('distributedCost.eachShare', { amount: money.format(high) })
        : t('distributedCost.mixedShare', {
            highCount: shares.filter((share) => share === high).length,
            highAmount: money.format(high),
            lowCount: shares.filter((share) => share === low).length,
            lowAmount: money.format(low),
          })

  const toggle = (propertyId: string) => {
    onSelectedIdsChange(
      selectedIds.includes(propertyId)
        ? selectedIds.filter((id) => id !== propertyId)
        : [...selectedIds, propertyId],
    )
  }

  return (
    <>
      <div className="distributed-cost-field">
        <div className="distributed-cost-toolbar">
          <p className="filter-title">{t('distributedCost.properties')}</p>
          <div className="table-actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                onSelectedIdsChange(properties.map((property) => property.id))
              }
            >
              {t('distributedCost.selectAll')}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => onSelectedIdsChange([])}
            >
              {t('common.clear')}
            </button>
          </div>
        </div>
        <div className="filter-options filter-options-scroll">
          {properties.map((property) => (
            <label className="filter-option" key={property.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(property.id)}
                onChange={() => toggle(property.id)}
              />
              <span>{getPropertyLabel(property)}</span>
            </label>
          ))}
        </div>
      </div>
      <label>
        {t('distributedCost.total')}
        <input
          type="number"
          step="0.01"
          value={total}
          onChange={(event) => onTotalChange(event.target.value)}
        />
      </label>
      {preview ? <p className="card-meta">{preview}</p> : null}
    </>
  )
}
