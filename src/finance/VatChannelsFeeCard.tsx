import {
  IVA_RATES,
  parseIvaRate,
  type IvaRate,
} from '../../amplify/functions/shared/iva'
import { DEFAULT_AIRBNB_FEE_PERCENT } from '../../amplify/functions/shared/property-report-payouts'

type Props = {
  cleaningVat: IvaRate
  accommodationVat: IvaRate
  airbnbFee: string
  onChange: (patch: {
    cleaningVat?: IvaRate
    accommodationVat?: IvaRate
    airbnbFee?: string
  }) => void
  t: (key: string) => string
}

const vatOptions = () =>
  IVA_RATES.map((rate) => (
    <option key={rate} value={rate}>
      {`${rate}%`}
    </option>
  ))

export function VatChannelsFeeCard({
  cleaningVat,
  accommodationVat,
  airbnbFee,
  onChange,
  t,
}: Props) {
  return (
    <section className="card">
      <h2 className="card-title">{t('propertyReports.cardVatChannels')}</h2>
      <p className="modal-subtitle">{t('propertyReports.cardVatChannelsHelp')}</p>
      <div className="form-grid">
        <label>
          {t('propertyReports.cleaningFeeVat')}
          <select
            value={String(cleaningVat)}
            onChange={(event) =>
              onChange({
                cleaningVat: parseIvaRate(event.target.value) ?? 0,
              })
            }
          >
            {vatOptions()}
          </select>
        </label>
        <label>
          {t('propertyReports.accommodationVat')}
          <select
            value={String(accommodationVat)}
            onChange={(event) =>
              onChange({
                accommodationVat: parseIvaRate(event.target.value) ?? 0,
              })
            }
          >
            {vatOptions()}
          </select>
        </label>
        <label>
          {t('propertyReports.airbnbFee')}
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={airbnbFee}
            placeholder={String(DEFAULT_AIRBNB_FEE_PERCENT)}
            onChange={(event) => onChange({ airbnbFee: event.target.value })}
          />
        </label>
      </div>
    </section>
  )
}
