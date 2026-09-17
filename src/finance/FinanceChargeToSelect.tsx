import { useTranslation } from 'react-i18next'
import { DEFAULT_MARKUP_PERCENT } from '../../amplify/functions/shared/property-report-settings'

type Props = {
  kind: 'cost' | 'income'
  value: string
  onChange: (value: string) => void
  markupPercent?: number
}

export function FinanceChargeToSelect({
  kind,
  value,
  onChange,
  markupPercent = DEFAULT_MARKUP_PERCENT,
}: Props) {
  const { t } = useTranslation()
  return (
    <label>
      {t('services.chargeTo')}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('services.chargeToUnset')}</option>
        {kind === 'income' ? (
          <>
            <option value="directToOwner">
              {t('propertyReports.allocationDirectToOwner')}
            </option>
            <option value="applyMarkup">
              {t('propertyReports.allocationApplyMarkup')}
            </option>
            <option value="doNotSend">
              {t('propertyReports.allocationDirectToUs')}
            </option>
          </>
        ) : (
          <>
            <option value="bear">{t('propertyReports.allocationBear')}</option>
            <option value="ownerPlus12">
              {t('propertyReports.allocationOwnerPlus12', {
                percent: markupPercent,
              })}
            </option>
            <option value="owner">
              {t('propertyReports.allocationOwner')}
            </option>
          </>
        )}
      </select>
    </label>
  )
}
