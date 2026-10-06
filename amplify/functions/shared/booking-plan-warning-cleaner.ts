import {
  LINEN_VALUES,
  PLANNER_WARNING_TEXT_ES,
  alertsForPlannerBooking,
  isBookingsPlanWithAlerts,
  type PlannerWarningCode,
} from './bookings-planner';
import { listPlannerWindowBookings } from './bookings-planner-window';
import { getTodayInMadrid } from './visit-task-utils';

export const BOOKING_PLAN_WARNING_CLEANER_ID = 'booking-plan-warning-cleaner';

export const RESOLVABLE_WARNING_CODES = [
  'linen_ask_guest',
  'double_or_two_singles_ask',
  'single_guest',
] as const;

export type ResolvableWarningCode = (typeof RESOLVABLE_WARNING_CODES)[number];

const RESOLVABLE = new Set<string>(RESOLVABLE_WARNING_CODES);

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const isResolvableWarningCode = (
  value: unknown,
): value is ResolvableWarningCode =>
  typeof value === 'string' && RESOLVABLE.has(value);

export type WarningCleanerAlert = {
  code: ResolvableWarningCode;
  warning: string;
  value: string;
};

export type WarningCleanerTarget = {
  reservationId: string;
  guestName: string;
  property: string;
  confirmationCode: string;
  alerts: WarningCleanerAlert[];
};

export type ParsedPlannerResolution =
  | { ok: false; error: string }
  | {
      ok: true;
      reservationId: string;
      warningCode: ResolvableWarningCode;
      quote: string;
      linen?: string;
      dismissWarning?: 'single_guest';
    };

const linenForWarning = (
  warningCode: ResolvableWarningCode,
  value: string,
): { ok: true; linen: string } | { ok: false; error: string } => {
  if (warningCode === 'linen_ask_guest') {
    if (value === LINEN_VALUES.YES || value === LINEN_VALUES.NO) {
      return { ok: true, linen: value };
    }
    return {
      ok: false,
      error: `value must be "${LINEN_VALUES.YES}" or "${LINEN_VALUES.NO}".`,
    };
  }
  if (warningCode === 'double_or_two_singles_ask') {
    if (value === LINEN_VALUES.DOUBLE || value === LINEN_VALUES.SINGLE) {
      return { ok: true, linen: value };
    }
    return {
      ok: false,
      error: `value must be "${LINEN_VALUES.DOUBLE}" or "${LINEN_VALUES.SINGLE}".`,
    };
  }
  return { ok: true, linen: '' };
};

export const parsePlannerResolutionArgs = (
  args: Record<string, unknown>,
): ParsedPlannerResolution => {
  const reservationId = asString(args.reservationId);
  const warningCode = asString(args.warningCode);
  const quote = asString(args.quote);
  const confidence = asString(args.confidence);
  const value = asString(args.value);
  if (!reservationId) {
    return { ok: false, error: 'reservationId is required.' };
  }
  if (confidence !== 'high') {
    return {
      ok: false,
      error: 'confidence must be "high". The booking was not changed.',
    };
  }
  if (quote.length < 3) {
    return {
      ok: false,
      error: 'quote must cite the guest message that justifies the change.',
    };
  }
  if (!isResolvableWarningCode(warningCode)) {
    return {
      ok: false,
      error:
        'warningCode must be linen_ask_guest, double_or_two_singles_ask, or single_guest.',
    };
  }
  if (warningCode === 'single_guest') {
    return {
      ok: true,
      reservationId,
      warningCode,
      quote,
      dismissWarning: 'single_guest',
    };
  }
  const linen = linenForWarning(warningCode, value);
  if (!linen.ok) {
    return linen;
  }
  return {
    ok: true,
    reservationId,
    warningCode,
    quote,
    linen: linen.linen,
  };
};

export const resolvableAlertsForBooking = (
  item: Record<string, unknown>,
): WarningCleanerAlert[] => {
  const alerts: WarningCleanerAlert[] = [];
  for (const alert of alertsForPlannerBooking(item)) {
    if (!isResolvableWarningCode(alert.code)) {
      continue;
    }
    alerts.push({
      code: alert.code,
      warning: alert.warning,
      value: alert.value,
    });
  }
  return alerts;
};

export const listWarningCleanerTargets = async (
  bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings',
): Promise<WarningCleanerTarget[]> => {
  const items = await listPlannerWindowBookings(
    bookingsTable,
    getTodayInMadrid(),
  );
  const targets: WarningCleanerTarget[] = [];
  for (const item of items) {
    const reservationId = asString(item.ReservationID);
    if (!reservationId || !isBookingsPlanWithAlerts(item)) {
      continue;
    }
    const alerts = resolvableAlertsForBooking(item);
    if (alerts.length === 0) {
      continue;
    }
    targets.push({
      reservationId,
      guestName: asString(item.GuestName),
      property:
        asString(item.ListingNickname) || asString(item.ListingName),
      confirmationCode: asString(item.ConfirmationCode),
      alerts,
    });
  }
  return targets;
};

export const buildWarningCleanerInput = (target: {
  reservationId: string;
  guestName?: string;
  property?: string;
  confirmationCode?: string;
  alerts?: WarningCleanerAlert[];
}) => {
  const alerts =
    target.alerts?.map(
      (alert) =>
        `- ${alert.code}: ${alert.warning} (current value: ${alert.value || '?'})`,
    ) ?? [];
  const lines = [
    'Review this Booking Plan reservation. Use only the reservationId below.',
    `reservationId: ${target.reservationId}`,
  ];
  if (target.confirmationCode) {
    lines.push(`confirmationCode: ${target.confirmationCode}`);
  }
  if (target.guestName) {
    lines.push(`guestName: ${target.guestName}`);
  }
  if (target.property) {
    lines.push(`property: ${target.property}`);
  }
  if (alerts.length > 0) {
    lines.push('openWarnings:');
    lines.push(...alerts);
  }
  lines.push(
    'Call list_booking_conversation with this reservationId. Write a field only if a guest message is an explicit answer to one of these warnings.',
  );
  return lines.join('\n');
};

export const warningLabel = (code: PlannerWarningCode) =>
  PLANNER_WARNING_TEXT_ES[code] || code;
