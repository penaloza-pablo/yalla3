import { extractConversationId } from '../../booking-conversation';
import {
  canonicalizeLinenValue,
  isBookingsPlanSofaCamaUnknownAsk,
  PLANNER_WINDOW_DAYS,
  sofaCamaUnknownWarningsFor,
  SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES,
  type SofaCamaUnknownWarningCode,
} from '../../bookings-planner';
import { listPlannerWindowBookings } from '../../bookings-planner-window';
import { resolveYallaPropertyLabel } from '../../property-identity';
import { getTodayInMadrid } from '../../visit-task-utils';
import type { AgentTool, CoverageItem, ToolResult } from '../types';
import { TOOL_CATALOG_VERSION } from './metadata';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

type SofaCamaUnknownBooking = {
  reservationId: string;
  conversationId: string;
  list_booking_conversation: { reservationId: string };
  guestName: string;
  property: string;
  listingId: string;
  checkIn: string;
  checkOut: string;
  linen: string;
  warning: string;
  warningCode: SofaCamaUnknownWarningCode;
  warnings: Array<{
    code: SofaCamaUnknownWarningCode;
    text: string;
  }>;
};

export const listBookingsPlanSofaCamaUnknownTool: AgentTool = {
  id: 'list_bookings_plan_sofa_cama_unknown',
  name: 'list_bookings_plan_sofa_cama_unknown',
  description:
    'Lists Booking Plan rows (confirmed check-ins in the planner window) where sofa bed / linen is unknown (?). Includes both warning texts: ask about the sofa bed, and for Arenal Verdejo ask if they want a double or two singles.',
  outputDescription:
    'JSON with businessDate, warningTexts, counts, and bookings[{reservationId, conversationId, list_booking_conversation: { reservationId }, guestName, property, linen, warning, warningCode, warnings[{code, text}]}]. reservationId is the required argument for list_booking_conversation; conversationId is the stored inbox pointer when present.',
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 20_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      businessDate: { type: 'string' },
      timezone: { type: 'string' },
      warningTexts: { type: 'object' },
      bookings: { type: 'array' },
      count: { type: 'number' },
      counts: { type: 'object' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (): Promise<ToolResult> => {
    const tableName = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const dateIso = getTodayInMadrid();
    const items = await listPlannerWindowBookings(tableName, dateIso);
    const bookings: SofaCamaUnknownBooking[] = [];
    const planned: CoverageItem[] = [];
    const unchecked: CoverageItem[] = [];
    const counts = {
      linen_ask_guest: 0,
      double_or_two_singles_ask: 0,
    };

    for (const item of items) {
      const reservationId = asString(item.ReservationID);
      if (!reservationId) {
        continue;
      }
      if (!isBookingsPlanSofaCamaUnknownAsk(item)) {
        continue;
      }
      const listingId = asString(item.ListingID);
      const listingNickname = asString(item.ListingNickname ?? item.ListingName);
      const linen = canonicalizeLinenValue(
        item.Linen,
        listingId,
        listingNickname,
      );
      const guestName = asString(item.GuestName);
      const conversationId = extractConversationId(item);
      const property =
        resolveYallaPropertyLabel({
          id: listingId,
          listingNickname,
          nickname: listingNickname,
        }) || listingNickname;
      const warningCodes = sofaCamaUnknownWarningsFor(item);
      const warnings = warningCodes.map((code) => ({
        code,
        text: SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES[code],
      }));
      const primary = warnings[0];
      if (!primary) {
        continue;
      }
      for (const code of warningCodes) {
        counts[code] += 1;
      }
      if (!conversationId) {
        unchecked.push({
          id: reservationId,
          label: guestName || reservationId,
          reason: 'Booking has no stored ConversationID pointer.',
          source: `yalla-bookings ReservationID=${reservationId}`,
        });
      }
      bookings.push({
        reservationId,
        conversationId,
        list_booking_conversation: { reservationId },
        guestName,
        property,
        listingId,
        checkIn: asString(item.CheckInDate).slice(0, 10),
        checkOut: asString(item.CheckOutDate).slice(0, 10),
        linen: linen || '?',
        warning: primary.text,
        warningCode: primary.code,
        warnings,
      });
      planned.push({
        id: reservationId,
        label: guestName || reservationId,
        detail: `${property} · ${primary.text}`,
        source: `Booking Plan sofa cama = ? ${primary.code}`,
      });
    }

    bookings.sort((left, right) => {
      const byDate = left.checkIn.localeCompare(right.checkIn);
      if (byDate !== 0) {
        return byDate;
      }
      const byWarning = left.warningCode.localeCompare(right.warningCode);
      if (byWarning !== 0) {
        return byWarning;
      }
      return left.guestName.localeCompare(right.guestName, 'es');
    });

    return {
      content: {
        businessDate: dateIso,
        timezone: 'Europe/Madrid',
        plannerWindowDays: PLANNER_WINDOW_DAYS,
        warningTexts: SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES,
        count: bookings.length,
        counts,
        bookings,
      },
      coverage: { planned, unchecked },
    };
  },
};
