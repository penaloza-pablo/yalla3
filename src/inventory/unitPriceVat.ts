import {
  IVA_RATES,
  occurrencePriceWithIva,
  parseIvaRate,
  priceFromGross,
  roundMoney,
  type IvaRate,
} from '../../amplify/functions/shared/iva'

export { IVA_RATES, parseIvaRate, roundMoney }
export type { IvaRate }

export type UnitPriceVatValue = {
  net: string
  gross: string
  vatRate: IvaRate
  lastEdited: 'net' | 'gross'
}

export const emptyUnitPriceVat = (
  vatRate: IvaRate = 21,
): UnitPriceVatValue => ({
  net: '',
  gross: '',
  vatRate,
  lastEdited: 'net',
})

const formatAmount = (value: number) => {
  if (!Number.isFinite(value)) {
    return ''
  }
  return String(roundMoney(value))
}

export const vatEuroFromNet = (net: number, vatRate: IvaRate) =>
  roundMoney(occurrencePriceWithIva(net, vatRate) - Math.max(0, net))

export const unitPriceVatEuro = (value: UnitPriceVatValue) => {
  const net = Number(value.net)
  if (!Number.isFinite(net) || value.net.trim() === '') {
    return null
  }
  return vatEuroFromNet(net, value.vatRate)
}

export const applyNetUnitPrice = (
  net: string,
  vatRate: IvaRate,
): UnitPriceVatValue => {
  const parsed = Number(net)
  if (net.trim() === '' || !Number.isFinite(parsed)) {
    return { net, gross: '', vatRate, lastEdited: 'net' }
  }
  return {
    net,
    gross: formatAmount(occurrencePriceWithIva(parsed, vatRate)),
    vatRate,
    lastEdited: 'net',
  }
}

export const applyGrossUnitPrice = (
  gross: string,
  vatRate: IvaRate,
): UnitPriceVatValue => {
  const parsed = Number(gross)
  if (gross.trim() === '' || !Number.isFinite(parsed)) {
    return { net: '', gross, vatRate, lastEdited: 'gross' }
  }
  return {
    net: formatAmount(priceFromGross(parsed, vatRate)),
    gross,
    vatRate,
    lastEdited: 'gross',
  }
}

export const applyVatRate = (
  current: UnitPriceVatValue,
  vatRate: IvaRate,
): UnitPriceVatValue =>
  current.lastEdited === 'gross'
    ? applyGrossUnitPrice(current.gross, vatRate)
    : applyNetUnitPrice(current.net, vatRate)

export const unitPriceVatFromStored = (params: {
  net?: number
  gross?: number
  vatRate?: unknown
  fallbackUnit?: number
}): UnitPriceVatValue => {
  const vatRate = parseIvaRate(params.vatRate) ?? 0
  const net =
    Number.isFinite(params.net) && (params.net ?? 0) > 0
      ? Number(params.net)
      : Number.isFinite(params.fallbackUnit) && (params.fallbackUnit ?? 0) > 0
        ? Number(params.fallbackUnit)
        : 0
  if (net > 0) {
    return applyNetUnitPrice(formatAmount(net), vatRate)
  }
  if (Number.isFinite(params.gross) && (params.gross ?? 0) > 0) {
    return applyGrossUnitPrice(formatAmount(Number(params.gross)), vatRate)
  }
  return emptyUnitPriceVat(vatRate)
}

export const resolvedUnitPriceVat = (value: UnitPriceVatValue) => {
  const net = Number(value.net)
  const gross = Number(value.gross)
  const hasNet = value.net.trim() !== '' && Number.isFinite(net)
  const hasGross = value.gross.trim() !== '' && Number.isFinite(gross)
  if (!hasNet && !hasGross) {
    return null
  }
  const synced =
    value.lastEdited === 'gross' && hasGross
      ? applyGrossUnitPrice(value.gross, value.vatRate)
      : applyNetUnitPrice(value.net, value.vatRate)
  const nextNet = Number(synced.net) || 0
  const nextGross = Number(synced.gross) || 0
  return {
    net: roundMoney(nextNet),
    gross: roundMoney(nextGross),
    vat: vatEuroFromNet(nextNet, synced.vatRate),
    vatRate: synced.vatRate,
  }
}
