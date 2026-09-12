import { useTranslation } from 'react-i18next'
import { IVA_RATES, type IvaRate } from '../../amplify/functions/shared/iva'
import {
  applyGrossUnitPrice,
  applyNetUnitPrice,
  applyVatRate,
  parseIvaRate,
  unitPriceVatEuro,
  type UnitPriceVatValue,
} from './unitPriceVat'

const ivaRateLabel = (rate: IvaRate, t: (key: string) => string) => {
  if (rate === 10) return t('common.iva10')
  if (rate === 21) return t('common.iva21')
  return t('common.iva0')
}

type Props = {
  value: UnitPriceVatValue
  onChange: (next: UnitPriceVatValue) => void
  disabled?: boolean
}

export const UnitPriceVatFields = ({ value, onChange, disabled }: Props) => {
  const { t } = useTranslation()
  const vatEuro = unitPriceVatEuro(value)

  return (
    <div className="form-grid form-field-span">
      <label className="form-field">
        <span>{t('common.netUnitPrice')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.net}
          disabled={disabled}
          onChange={(event) =>
            onChange(applyNetUnitPrice(event.target.value, value.vatRate))
          }
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>{t('common.ivaPercent')}</span>
        <select
          value={String(value.vatRate)}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              applyVatRate(value, parseIvaRate(event.target.value) ?? 0),
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
        <span>{t('common.grossUnitPrice')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value.gross}
          disabled={disabled}
          onChange={(event) =>
            onChange(applyGrossUnitPrice(event.target.value, value.vatRate))
          }
          placeholder="0.00"
        />
      </label>
    </div>
  )
}

export const UnitPriceVatDetails = ({
  net,
  vatRate,
  formatMoney,
}: {
  net: number
  vatRate: IvaRate | null
  formatMoney: (value: number) => string
}) => {
  const { t } = useTranslation()
  const hasRate = vatRate !== null
  const euro = hasRate ? unitPriceVatEuro(applyNetUnitPrice(String(net || 0), vatRate)) : null
  const gross =
    hasRate && Number.isFinite(net)
      ? Number(applyNetUnitPrice(String(net || 0), vatRate).gross) || 0
      : null

  return (
    <>
      <div>
        <p className="detail-label">{t('common.netUnitPrice')}</p>
        <p className="detail-value">{formatMoney(net)}</p>
      </div>
      <div>
        <p className="detail-label">{t('common.ivaPercent')}</p>
        <p className="detail-value">
          {hasRate ? ivaRateLabel(vatRate, t) : '—'}
        </p>
      </div>
      <div>
        <p className="detail-label">{t('common.ivaEuro')}</p>
        <p className="detail-value">
          {euro === null
            ? '—'
            : euro === 0
              ? '€ 0'
              : formatMoney(euro)}
        </p>
      </div>
      <div>
        <p className="detail-label">{t('common.grossUnitPrice')}</p>
        <p className="detail-value">
          {gross === null ? '—' : formatMoney(gross)}
        </p>
      </div>
    </>
  )
}
