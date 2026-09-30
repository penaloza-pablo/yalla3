import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  NATIVE_PERIOD_START,
  eachMonth,
  isMonthId,
  overlayReviewMetrics,
  splitReadableActuals,
  type ReviewMonthSummary,
  type StoredActual,
} from '../shared/finance-historic';
import { queryHistoricPrefix } from '../shared/finance-historic-store';
import {
  reviewsForReservationIds,
  summarizeReportReviews,
} from '../shared/property-report-reviews';
import { scanReviewsForReport } from '../shared/property-report-reviews-store';
import {
  applyCalendarMetrics,
  calendarMetricsForMonth,
  calendarQueryDates,
  calendarStayFromBooking,
} from '../shared/calendar-occupancy';
import {
  asString,
  datesInReportMonth,
  getBookingById,
  getReportRecord,
  listingMatchesProperty,
  queryBookingsByCheckInDate,
} from '../shared/property-reports';
import { docClient, getTodayInMadrid } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const asMetricMap = (value: unknown) => {
  const metrics: Record<string, string | null> = {};
  if (!value || typeof value !== 'object') return metrics;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    metrics[key] = typeof entry === 'string' ? entry : null;
  }
  return metrics;
};

const asFlags = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const currentMonthId = () => new Date().toISOString().slice(0, 7);

const reservationIdsForMonth = async (
  bookingsTable: string,
  property: Record<string, unknown>,
  monthId: string,
) => {
  const ids = new Set<string>();
  const dates = datesInReportMonth(monthId);
  for (let index = 0; index < dates.length; index += 8) {
    const pages = await Promise.all(
      dates
        .slice(index, index + 8)
        .map((date) => queryBookingsByCheckInDate(bookingsTable, date)),
    );
    for (const page of pages) {
      for (const item of page) {
        const reservationId = asString(item.ReservationID);
        if (!reservationId || ids.has(reservationId)) continue;
        if (asString(item.Status).toLowerCase() === 'inquiry') continue;
        if (!listingMatchesProperty(item, property)) continue;
        ids.add(reservationId);
      }
    }
  }
  return ids;
};

const bookingsForCalendar = async (
  bookingsTable: string,
  property: Record<string, unknown>,
  propertyId: string,
  from: string,
  to: string,
) => {
  const reservationIds: string[] = [];
  const dates = calendarQueryDates(from, to);
  for (let index = 0; index < dates.length; index += 8) {
    const pages = await Promise.all(
      dates
        .slice(index, index + 8)
        .map((date) => queryBookingsByCheckInDate(bookingsTable, date)),
    );
    for (const page of pages) {
      for (const item of page) {
        const reservationId = asString(item.ReservationID);
        if (!reservationId || reservationIds.includes(reservationId)) continue;
        if (!listingMatchesProperty(item, property)) continue;
        reservationIds.push(reservationId);
      }
    }
  }
  const stays = new Map<string, NonNullable<ReturnType<typeof calendarStayFromBooking>>>();
  for (let index = 0; index < reservationIds.length; index += 8) {
    const items = await Promise.all(
      reservationIds
        .slice(index, index + 8)
        .map((reservationId) => getBookingById(bookingsTable, reservationId)),
    );
    for (const item of items) {
      if (!item || !listingMatchesProperty(item, property)) continue;
      const stay = calendarStayFromBooking(item, propertyId);
      if (!stay || stays.has(stay.reservationId)) continue;
      stays.set(stay.reservationId, stay);
    }
  }
  return [...stays.values()];
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.HISTORIC_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  const bookingsTable = process.env.BOOKINGS_TABLE;
  const reviewsTable = process.env.REVIEWS_TABLE;
  const reportsTable = process.env.REPORTS_TABLE || process.env.TABLE_NAME;
  if (!tableName || !propertiesTable || !bookingsTable || !reviewsTable) {
    return buildHttpResponse(500, {
      message: 'Historic tables are not configured.',
    });
  }

  const propertyId = event.queryStringParameters?.propertyId?.trim() ?? '';
  const from = event.queryStringParameters?.from?.trim() || '2025-01';
  const to = event.queryStringParameters?.to?.trim() || currentMonthId();
  if (!propertyId) {
    return buildHttpResponse(400, { message: 'propertyId is required.' });
  }
  if (!isMonthId(from) || !isMonthId(to) || from > to) {
    return buildHttpResponse(400, { message: 'from and to must be YYYY-MM.' });
  }

  try {
    const propertyResult = await docClient.send(
      new GetCommand({
        TableName: propertiesTable,
        Key: { id: propertyId },
      }),
    );
    const property = propertyResult.Item as Record<string, unknown> | undefined;
    if (!property) {
      return buildHttpResponse(404, { message: 'Property was not found.' });
    }

    const [actualItems, benchmarkItems, eventItems, reviewItems] =
      await Promise.all([
        queryHistoricPrefix(tableName, propertyId, 'ACTUAL#'),
        queryHistoricPrefix(tableName, propertyId, 'BENCH#'),
        queryHistoricPrefix(tableName, propertyId, 'EVENT#'),
        scanReviewsForReport(reviewsTable),
      ]);

    const storedActuals: StoredActual[] = actualItems.map((item) => ({
      period: asString(item.period),
      dataOrigin: asString(item.dataOrigin),
      metrics: asMetricMap(item.metrics),
      qualityFlags: asFlags(item.qualityFlags),
    }));
    const { visible, blockedPeriods } = splitReadableActuals(storedActuals);
    const visibleByPeriod = new Map(visible.map((item) => [item.period, item]));
    const months = eachMonth(from, to);
    const reviewByMonth = new Map<string, ReviewMonthSummary | null>();
    for (let index = 0; index < months.length; index += 3) {
      const slice = months.slice(index, index + 3);
      await Promise.all(
        slice.map(async (period) => {
          const reservationIds = await reservationIdsForMonth(
            bookingsTable,
            property,
            period,
          );
          if (reservationIds.size === 0) {
            reviewByMonth.set(period, null);
            return;
          }
          const reviews = reviewsForReservationIds(reviewItems, reservationIds);
          reviewByMonth.set(period, summarizeReportReviews(reviews));
        }),
      );
    }

    let calendarStays: ReturnType<typeof calendarStayFromBooking>[] = [];
    let calendarUnavailable = false;
    try {
      calendarStays = await bookingsForCalendar(
        bookingsTable,
        property,
        propertyId,
        from,
        to,
      );
    } catch (calendarError) {
      calendarUnavailable = true;
      console.warn('Calendar occupancy was not calculated', calendarError);
    }
    const calendarToday = getTodayInMadrid();
    const calendarUpdatedAt = new Date().toISOString();

    const monthRows = [];
    for (const period of months) {
      const stored = visibleByPeriod.get(period);
      const overlay = overlayReviewMetrics(
        stored?.metrics ?? {},
        reviewByMonth.get(period) ?? null,
      );
      let nativeClose: string | null = null;
      if (!stored && period >= NATIVE_PERIOD_START && reportsTable) {
        const report = await getReportRecord(reportsTable, propertyId, period);
        const status = asString(report?.status);
        nativeClose =
          status === 'READY_TO_PUBLISH' || status === 'PUBLISHED'
            ? 'closed_without_snapshot'
            : status
              ? 'open'
              : 'missing';
      }
      const calendar = calendarUnavailable
        ? null
        : calendarMetricsForMonth({
            propertyId,
            period,
            stays: calendarStays.filter(
              (stay): stay is NonNullable<typeof stay> => stay !== null,
            ),
            today: calendarToday,
            updatedAt: calendarUpdatedAt,
          });
      monthRows.push({
        period,
        dataOrigin: stored?.dataOrigin ?? null,
        metrics: calendar
          ? applyCalendarMetrics(overlay.metrics, calendar, {
              preserveStored: period < NATIVE_PERIOD_START,
            })
          : overlay.metrics,
        qualityFlags: [
          ...new Set([
            ...(stored?.qualityFlags ?? []),
            ...(calendar?.qualityFlags ?? []),
            ...(calendarUnavailable ? ['calendarUnavailable'] : []),
          ]),
        ],
        calendar: calendar
          ? {
              version: calendar.version,
              updatedAt: calendar.updatedAt,
              coverage: calendar.coverage,
              methods: calendar.methods,
              issues: calendar.issues,
              reservations: calendar.reservations,
            }
          : null,
        reviewsLive: overlay.reviewsLive,
        rescuedUnderFiveStarReviewCount: overlay.reviewsLive
          ? overlay.rescuedUnderFiveStarReviewCount
          : null,
        nativeClose,
      });
    }

    return buildHttpResponse(200, {
      propertyId,
      nickname: asString(property.nickname),
      active: property.active !== false,
      currency: 'EUR',
      amountUnit: 'major',
      from,
      to,
      months: monthRows,
      blockedExternalPeriods: blockedPeriods,
      benchmarks: benchmarkItems.map((item) => ({
        benchmarkKey: asString(item.benchmarkKey),
        label: asString(item.label) || 'AirDNA',
        asOfDateLabel: asString(item.asOfDateLabel) || null,
        metrics: asMetricMap(item.metrics),
        qualityFlags: asFlags(item.qualityFlags),
      })),
      events: eventItems
        .map((item) => ({
          eventId: asString(item.eventId),
          date: asString(item.date),
          title: asString(item.title),
          note: asString(item.note) || null,
        }))
        .filter((item) => item.eventId && item.date && item.title)
        .sort((left, right) => left.date.localeCompare(right.date)),
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read finance historic.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
