import { parseIvaRate, type IvaRate } from './iva';
import type { PropertyReportSettings } from './property-report-settings';

export const DEFAULT_AIRBNB_FEE_PERCENT = 15.5;
export const DEFAULT_PAYOUT_VAT: IvaRate = 0;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export type PayoutVatSettings = {
  cleaningVat: IvaRate;
  accommodationVat: IvaRate;
  airbnbFeePercent: number;
};

export type PayoutBreakdown = {
  cleaningFee: number | null;
  cleaningGross: number | null;
  cleaningPayoutVat: number | null;
  cleaningNet: number | null;
  accommodationGross: number | null;
  accommodationPayoutVat: number | null;
  accommodationNet: number | null;
};

export const payoutVatFromSettings = (
  settings?: Pick<
    PropertyReportSettings,
    'cleaningVat' | 'accommodationVat' | 'airbnbFeePercent'
  > | null,
): PayoutVatSettings => ({
  cleaningVat: parseIvaRate(settings?.cleaningVat) ?? DEFAULT_PAYOUT_VAT,
  accommodationVat:
    parseIvaRate(settings?.accommodationVat) ?? DEFAULT_PAYOUT_VAT,
  airbnbFeePercent:
    typeof settings?.airbnbFeePercent === 'number' &&
    Number.isFinite(settings.airbnbFeePercent)
      ? settings.airbnbFeePercent
      : DEFAULT_AIRBNB_FEE_PERCENT,
});

export const computePayoutBreakdown = (
  input: { fareCleaning: number | null; hostPayout: number | null },
  settings?: Pick<
    PropertyReportSettings,
    'cleaningVat' | 'accommodationVat' | 'airbnbFeePercent'
  > | null,
): PayoutBreakdown => {
  const vat = payoutVatFromSettings(settings);
  const airbnbRate = vat.airbnbFeePercent / 100;
  const cleaningVatRate = vat.cleaningVat / 100;
  const accommodationVatRate = vat.accommodationVat / 100;

  const cleaningFee = input.fareCleaning;
  const cleaningGross =
    cleaningFee === null
      ? null
      : roundMoney(cleaningFee - cleaningFee * airbnbRate);
  const cleaningPayoutVat =
    cleaningGross === null
      ? null
      : roundMoney(cleaningGross * cleaningVatRate);
  const cleaningNet =
    cleaningGross === null || cleaningPayoutVat === null
      ? null
      : roundMoney(cleaningGross - cleaningPayoutVat);

  const accommodationGross =
    input.hostPayout === null
      ? null
      : roundMoney(input.hostPayout - (cleaningGross ?? 0));
  const accommodationPayoutVat =
    accommodationGross === null
      ? null
      : roundMoney(accommodationGross * accommodationVatRate);
  const accommodationNet =
    accommodationGross === null || accommodationPayoutVat === null
      ? null
      : roundMoney(accommodationGross - accommodationPayoutVat);

  return {
    cleaningFee,
    cleaningGross,
    cleaningPayoutVat,
    cleaningNet,
    accommodationGross,
    accommodationPayoutVat,
    accommodationNet,
  };
};

export const sumPayoutField = (
  rows: PayoutBreakdown[],
  field: keyof PayoutBreakdown,
) =>
  roundMoney(
    rows.reduce((sum, row) => sum + (row[field] ?? 0), 0),
  );
