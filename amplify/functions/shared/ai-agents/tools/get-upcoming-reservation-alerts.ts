import { extractConversationId } from '../../booking-conversation';
import {
  alertsForPlannerBooking,
  canonicalizeLinenValue,
  isBookingsPlanWithAlerts,
  PLANNER_WINDOW_DAYS,
  type PlannerAlertType,
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

const emptyCounts = (): Record<PlannerAlertType, number> => ({
  SOFA_BED: 0,
  ACCESS_LINK: 0,
  SINGLE_GUEST_VERIFICATION: 0,
});

export const getUpcomingReservationAlertsTool: AgentTool = {
  id: 'get_upcoming_reservation_alerts',
  name: 'get_upcoming_reservation_alerts',
  description:
    'Lists upcoming Booking Plan reservations (confirmed check-ins in the planner window) that still have warnings. Each warning is a separate alert: sofa bed unknown, missing Access code/link, or single-guest verification. Gift card is never an alert; the system always calculates it.',
  outputDescription:
    'JSON with reservations[{reservationId, conversationId, list_booking_conversation: { reservationId }, guestName, property, checkIn, checkOut, guests, linen, access, alerts[{type, code, value, warning}]}]. reservationId is the required argument for list_booking_conversation; conversationId is the stored inbox pointer when present.',
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
      reservations: { type: 'array' },
      count: { type: 'number' },
      alertCount: { type: 'number' },
      countsByType: { type: 'object' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (): Promise<ToolResult> => {
    const tableName = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const dateIso = getTodayInMadrid();
    const items = await listPlannerWindowBookings(tableName, dateIso);
    const reservations: Array<{
      reservationId: string;
      conversationId: string;
      list_booking_conversation: { reservationId: string };
      guestName: string;
      property: string;
      listingId: string;
      checkIn: string;
      checkOut: string;
      guests: string;
      linen: string;
      access: string;
      alerts: ReturnType<typeof alertsForPlannerBooking>;
    }> = [];
    const planned: CoverageItem[] = [];
    const unchecked: CoverageItem[] = [];
    const countsByType = emptyCounts();
    let alertCount = 0;

    for (const item of items) {
      const reservationId = asString(item.ReservationID);
      if (!reservationId || !isBookingsPlanWithAlerts(item)) {
        continue;
      }
      const alerts = alertsForPlannerBooking(item);
      if (alerts.length === 0) {
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
      for (const alert of alerts) {
        countsByType[alert.type] += 1;
        alertCount += 1;
      }
      if (!conversationId) {
        unchecked.push({
          id: reservationId,
          label: guestName || reservationId,
          reason: 'Booking has no stored ConversationID pointer.',
          source: `yalla-bookings ReservationID=${reservationId}`,
        });
      }
      reservations.push({
        reservationId,
        conversationId,
        list_booking_conversation: { reservationId },
        guestName,
        property,
        listingId,
        checkIn: asString(item.CheckInDate).slice(0, 10),
        checkOut: asString(item.CheckOutDate).slice(0, 10),
        guests: asString(item.Guests),
        linen: linen || '?',
        access: asString(item.Access),
        alerts,
      });
      planned.push({
        id: reservationId,
        label: guestName || reservationId,
        detail: `${property} · ${alerts.length} alert${alerts.length === 1 ? '' : 's'}`,
        source: 'Booking Plan warnings',
      });
    }

    reservations.sort((left, right) => {
      const byDate = left.checkIn.localeCompare(right.checkIn);
      if (byDate !== 0) {
        return byDate;
      }
      return left.guestName.localeCompare(right.guestName, 'es');
    });

    return {
      content: {
        businessDate: dateIso,
        timezone: 'Europe/Madrid',
        plannerWindowDays: PLANNER_WINDOW_DAYS,
        count: reservations.length,
        alertCount,
        countsByType,
        reservations,
      },
      coverage: { planned, unchecked },
    };
  },
};
