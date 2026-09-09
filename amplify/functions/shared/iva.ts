export const IVA_RATES = [0, 10, 21] as const;
export type IvaRate = (typeof IVA_RATES)[number];

export const STANDARD_IVA_RATE: IvaRate = 21;

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const ivaMultiplier = (rate: IvaRate) => 1 + rate / 100;

export const IVA_MULTIPLIER = ivaMultiplier(STANDARD_IVA_RATE);

export const parseIvaRate = (value: unknown): IvaRate | null => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return parsed === 0 || parsed === 10 || parsed === 21 ? parsed : null;
};

export const resolveIvaRate = (item: {
  ivaRate?: unknown;
  appliesIva?: unknown;
}): IvaRate => {
  const fromRate = parseIvaRate(item.ivaRate);
  if (fromRate !== null) {
    return fromRate;
  }
  return item.appliesIva === true || item.appliesIva === 'true' ? 21 : 0;
};

export const resolveIvaRateFromInput = (
  payload: { ivaRate?: unknown; appliesIva?: unknown },
  existing?: { ivaRate?: unknown; appliesIva?: unknown },
): IvaRate => {
  if (
    payload.ivaRate !== undefined &&
    payload.ivaRate !== null &&
    payload.ivaRate !== ''
  ) {
    const parsed = parseIvaRate(payload.ivaRate);
    if (parsed !== null) {
      return parsed;
    }
  }
  if (typeof payload.appliesIva === 'boolean') {
    return payload.appliesIva ? 21 : 0;
  }
  return resolveIvaRate(existing ?? {});
};

export const persistIvaFields = (ivaRate: IvaRate) => ({
  ivaRate,
  appliesIva: ivaRate > 0,
});

export const occurrencePriceWithIva = (price: number, ivaRate: IvaRate) =>
  roundMoney(Math.max(0, price) * ivaMultiplier(ivaRate));

export const priceFromGross = (priceWithIva: number, ivaRate: IvaRate) =>
  ivaRate === 0
    ? roundMoney(Math.max(0, priceWithIva))
    : roundMoney(Math.max(0, priceWithIva) / ivaMultiplier(ivaRate));
