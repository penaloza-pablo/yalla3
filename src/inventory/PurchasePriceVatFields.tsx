import { useTranslation } from 'react-i18next'
import { IVA_RATES, type IvaRate } from '../../amplify/functions/shared/iva'
import {
  applyPurchasePriceVatRate,
  parseIvaRate,
  purchaseVatEuro,
  syncPurchaseFromGross,
  syncPurchaseFromNet,
  syncPurchaseFromTotalGross,
  syncPurchaseFromTotalNet,
  type PurchasePriceVatValue,
} from './unitPriceVat'

const ivaRateLabel = (rate: IvaRate, t: (key: string) => string) => {
  if (rate === 10) return t('common.iva10')
  if (rate === 21) return t('common.iva21')
  return t('common.iva0')
}

type Props = {
  value: PurchasePriceVatValue
  units: string
  onChange: (next: PurchasePriceVatValue) => void
  disabled?: boolean
}

export const PurchasePriceVatFields = ({
  value,
  units,
  onChange,
  disabled,
}: Props) => {
  const { t } = useTranslation()
  const vatEuro = purchaseVatEuro(value)

  return (
    <>
      <label className="form-field">
        <span>{t('common.ivaPercent')}</span>
        <select
          value={String(value.vatRate)}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              applyPurchasePriceVatRate(
                value,
                parseIvaRate(event.target.value) ?? 0,
                units,
              ),
            )
          }
        >
          {IVA_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {ivaRateLabel(rate, t)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>{t('common.ivaEuro')}</span>
        <input
          type="text"
          value={vatEuro === null ? '' : vatEuro.toFixed(2)}
          disabled
          readOnly
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>{t('common.netTotal')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.totalNet}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              syncPurchaseFromTotalNet(event.target.value, units, value.vatRate),
            )
          }
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>{t('common.grossTotal')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.totalGross}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              syncPurchaseFromTotalGross(
                event.target.value,
                units,
                value.vatRate,
              ),
            )
          }
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>{t('common.netUnitPrice')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.net}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              syncPurchaseFromNet(event.target.value, units, value.vatRate),
            )
          }
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>{t('common.grossUnitPrice')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.gross}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              syncPurchaseFromGross(event.target.value, units, value.vatRate),
            )
          }
          placeholder="0.00"
        />
      </label>
    </>
  )
}
