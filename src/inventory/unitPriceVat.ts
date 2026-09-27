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

export type PurchasePriceEdit = 'net' | 'gross' | 'totalNet' | 'totalGross'

export type PurchasePriceVatValue = {
  net: string
  gross: string
  totalNet: string
  totalGross: string
  vatRate: IvaRate
  lastEdited: PurchasePriceEdit
}

export const emptyPurchasePriceVat = (
  vatRate: IvaRate = 21,
): PurchasePriceVatValue => ({
  net: '',
  gross: '',
  totalNet: '',
  totalGross: '',
  vatRate,
  lastEdited: 'net',
})

const parsePositiveUnits = (units: string) => {
  const parsed = Number(units)
  if (units.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

export const syncPurchaseFromNet = (
  net: string,
  units: string,
  vatRate: IvaRate,
): PurchasePriceVatValue => {
  const parsed = Number(net)
  if (net.trim() === '' || !Number.isFinite(parsed)) {
    return {
      net,
      gross: '',
      totalNet: '',
      totalGross: '',
      vatRate,
      lastEdited: 'net',
    }
  }
  const gross = occurrencePriceWithIva(parsed, vatRate)
  const unitsValue = parsePositiveUnits(units)
  return {
    net,
    gross: formatAmount(gross),
    totalNet: unitsValue ? formatAmount(roundMoney(parsed * unitsValue)) : '',
    totalGross: unitsValue ? formatAmount(roundMoney(gross * unitsValue)) : '',
    vatRate,
    lastEdited: 'net',
  }
}

export const syncPurchaseFromGross = (
  gross: string,
  units: string,
  vatRate: IvaRate,
): PurchasePriceVatValue => {
  const parsed = Number(gross)
  if (gross.trim() === '' || !Number.isFinite(parsed)) {
    return {
      net: '',
      gross,
      totalNet: '',
      totalGross: '',
      vatRate,
      lastEdited: 'gross',
    }
  }
  const net = priceFromGross(parsed, vatRate)
  const unitsValue = parsePositiveUnits(units)
  return {
    net: formatAmount(net),
    gross,
    totalNet: unitsValue ? formatAmount(roundMoney(net * unitsValue)) : '',
    totalGross: unitsValue ? formatAmount(roundMoney(parsed * unitsValue)) : '',
    vatRate,
    lastEdited: 'gross',
  }
}

export const syncPurchaseFromTotalNet = (
  totalNet: string,
  units: string,
  vatRate: IvaRate,
): PurchasePriceVatValue => {
  const parsed = Number(totalNet)
  if (totalNet.trim() === '' || !Number.isFinite(parsed)) {
    return {
      net: '',
      gross: '',
      totalNet,
      totalGross: '',
      vatRate,
      lastEdited: 'totalNet',
    }
  }
  const totalGross = occurrencePriceWithIva(parsed, vatRate)
  const unitsValue = parsePositiveUnits(units)
  return {
    net: unitsValue ? formatAmount(roundMoney(parsed / unitsValue)) : '',
    gross: unitsValue ? formatAmount(roundMoney(totalGross / unitsValue)) : '',
    totalNet,
    totalGross: formatAmount(totalGross),
    vatRate,
    lastEdited: 'totalNet',
  }
}

export const syncPurchaseFromTotalGross = (
  totalGross: string,
  units: string,
  vatRate: IvaRate,
): PurchasePriceVatValue => {
  const parsed = Number(totalGross)
  if (totalGross.trim() === '' || !Number.isFinite(parsed)) {
    return {
      net: '',
      gross: '',
      totalNet: '',
      totalGross,
      vatRate,
      lastEdited: 'totalGross',
    }
  }
  const totalNet = priceFromGross(parsed, vatRate)
  const unitsValue = parsePositiveUnits(units)
  return {
    net: unitsValue ? formatAmount(roundMoney(totalNet / unitsValue)) : '',
    gross: unitsValue ? formatAmount(roundMoney(parsed / unitsValue)) : '',
    totalNet: formatAmount(totalNet),
    totalGross,
    vatRate,
    lastEdited: 'totalGross',
  }
}

export const applyPurchasePriceUnits = (
  current: PurchasePriceVatValue,
  units: string,
): PurchasePriceVatValue => {
  if (current.lastEdited === 'gross') {
    return syncPurchaseFromGross(current.gross, units, current.vatRate)
  }
  if (current.lastEdited === 'totalNet') {
    return syncPurchaseFromTotalNet(current.totalNet, units, current.vatRate)
  }
  if (current.lastEdited === 'totalGross') {
    return syncPurchaseFromTotalGross(current.totalGross, units, current.vatRate)
  }
  return syncPurchaseFromNet(current.net, units, current.vatRate)
}

export const applyPurchasePriceVatRate = (
  current: PurchasePriceVatValue,
  vatRate: IvaRate,
  units: string,
): PurchasePriceVatValue =>
  applyPurchasePriceUnits({ ...current, vatRate }, units)

export const purchaseVatEuro = (value: PurchasePriceVatValue) => {
  const totalNet = Number(value.totalNet)
  const totalGross = Number(value.totalGross)
  if (
    value.totalNet.trim() !== '' &&
    value.totalGross.trim() !== '' &&
    Number.isFinite(totalNet) &&
    Number.isFinite(totalGross)
  ) {
    return roundMoney(totalGross - totalNet)
  }
  return unitPriceVatEuro({
    net: value.net,
    gross: value.gross,
    vatRate: value.vatRate,
    lastEdited:
      value.lastEdited === 'gross' || value.lastEdited === 'totalGross'
        ? 'gross'
        : 'net',
  })
}

export const purchasePriceVatFromStored = (params: {
  net?: number
  gross?: number
  vatRate?: unknown
  fallbackUnit?: number
  totalGross?: number
  units?: number | string
}): PurchasePriceVatValue => {
  const units =
    params.units === undefined || params.units === null
      ? ''
      : String(params.units)
  const vatRate = parseIvaRate(params.vatRate) ?? 0
  if (
    Number.isFinite(params.totalGross) &&
    (params.totalGross ?? 0) > 0 &&
    parsePositiveUnits(units)
  ) {
    return syncPurchaseFromTotalGross(
      formatAmount(Number(params.totalGross)),
      units,
      vatRate,
    )
  }
  const unit = unitPriceVatFromStored(params)
  if (unit.lastEdited === 'gross' && unit.gross.trim()) {
    return syncPurchaseFromGross(unit.gross, units, unit.vatRate)
  }
  if (unit.net.trim()) {
    return syncPurchaseFromNet(unit.net, units, unit.vatRate)
  }
  return emptyPurchasePriceVat(vatRate)
}

export const toUnitPriceVatValue = (
  value: PurchasePriceVatValue,
): UnitPriceVatValue => ({
  net: value.net,
  gross: value.gross,
  vatRate: value.vatRate,
  lastEdited:
    value.lastEdited === 'gross' || value.lastEdited === 'totalGross'
      ? 'gross'
      : 'net',
})

export const resolvedPurchasePriceVat = (
  value: PurchasePriceVatValue,
  units: string,
) => {
  const synced = applyPurchasePriceUnits(value, units)
  return resolvedUnitPriceVat(toUnitPriceVatValue(synced))
}
