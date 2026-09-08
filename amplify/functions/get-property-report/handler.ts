import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { buildMonthDetail as buildCleaningMonthDetail } from '../shared/cleaning-billing';
import { buildMonthDetail as buildMaintenanceMonthDetail } from '../shared/maintenance-billing';
import {
  asString,
  bookingHasPayout,
  datesInReportMonth,
  getBookingById,
  getPropertyById,
  getReportRecord,
  isMonthIdValue,
  isPhase1Month,
  isPhase1Property,
  listingMatchesProperty,
  loadFinanceMovements,
  loadFinanceServices,
  loadPendingBillingExpenses,
  mapReportBooking,
  PHASE1_MONTH_IDS,
  queryBookingsByCheckInDate,
  reportMonthSummary,
  reservationFromPayload,
  roundMoney,
} from '../shared/property-reports';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const loadPayoutBookings = async (
  bookingsTable: string,
  property: Record<string, unknown>,
  monthId: string,
) => {
  const seen = new Set<string>();
  const bookings = [];
  for (const date of datesInReportMonth(monthId)) {
    const page = await queryBookingsByCheckInDate(bookingsTable, date);
    for (const summary of page) {
      const reservationId = asString(summary.ReservationID);
      if (!reservationId || seen.has(reservationId)) {
        continue;
      }
      const listingKnown =
        Boolean(asString(summary.ListingID)) ||
        Boolean(asString(summary.ListingNickname));
      if (listingKnown && !listingMatchesProperty(summary, property)) {
        continue;
      }
      if (asString(summary.Status).toLowerCase() === 'inquiry') {
        seen.add(reservationId);
        continue;
      }
      seen.add(reservationId);
      const item =
        (await getBookingById(bookingsTable, reservationId)) ?? summary;
      if (!listingMatchesProperty(item, property)) {
        continue;
      }
      const reservation = reservationFromPayload(item.RawPayload);
      if (!bookingHasPayout(reservation, item)) {
        continue;
      }
      bookings.push(mapReportBooking(item, reservation));
    }
  }
  bookings.sort((left, right) => {
    if (left.checkInDate !== right.checkInDate) {
      return left.checkInDate.localeCompare(right.checkInDate);
    }
    return left.bookingId.localeCompare(right.bookingId);
  });
  return bookings;
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

  const reportsTable = process.env.TABLE_NAME;
  const bookingsTable = process.env.BOOKINGS_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  const cleaningBillingTable = process.env.CLEANING_BILLING_TABLE;
  const cleaningPlansTable = process.env.CLEANING_PLANS_TABLE;
  const cleaningDetailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE;
  const visitsTable = process.env.VISITS_TABLE;
  const maintenanceBillingTable = process.env.MAINTENANCE_BILLING_TABLE;
  const maintenanceSettingsTable = process.env.SETTINGS_TABLE;
  const providersTable = process.env.PROVIDERS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  const subtractionsTable = process.env.SUBTRACTIONS_TABLE;
  const movementsTable = process.env.MOVEMENTS_TABLE;
  const servicesTable = process.env.SERVICES_TABLE;

  if (
    !reportsTable ||
    !bookingsTable ||
    !propertiesTable ||
    !cleaningBillingTable ||
    !cleaningPlansTable ||
    !visitsTable ||
    !maintenanceBillingTable ||
    !maintenanceSettingsTable ||
    !providersTable ||
    !visitTypesTable ||
    !subtractionsTable ||
    !movementsTable ||
    !servicesTable
  ) {
    return buildHttpResponse(500, {
      message: 'Property report tables are not configured.',
    });
  }

  const propertyId = event.queryStringParameters?.propertyId?.trim();
  const monthId = event.queryStringParameters?.month?.trim();
  if (!propertyId) {
    return buildHttpResponse(400, { message: 'propertyId is required.' });
  }

  try {
    const property = await getPropertyById(propertiesTable, propertyId);
    if (!property || !isPhase1Property(property)) {
      return buildHttpResponse(404, {
        message: 'Property is not available in this Property Reports phase.',
      });
    }

    const months = [];
    for (const id of PHASE1_MONTH_IDS) {
      const stored = await getReportRecord(reportsTable, propertyId, id);
      months.push(reportMonthSummary(id, stored));
    }

    if (!monthId) {
      return buildHttpResponse(200, {
        property: {
          id: propertyId,
          name:
            asString(property.nickname) ||
            asString(property.listingNickname) ||
            asString(property.title) ||
            propertyId,
        },
        months,
      });
    }

    if (!isMonthIdValue(monthId) || !isPhase1Month(monthId)) {
      return buildHttpResponse(404, {
        message: 'Month is not available in this Property Reports phase.',
      });
    }

    const stored = await getReportRecord(reportsTable, propertyId, monthId);
    const report = reportMonthSummary(monthId, stored);

    const [
      bookings,
      cleaningDetail,
      maintenanceDetail,
      subtractionExpenses,
      movementExpenses,
      serviceLines,
    ] = await Promise.all([
      loadPayoutBookings(bookingsTable, property, monthId),
      buildCleaningMonthDetail({
        monthId,
        billingTable: cleaningBillingTable,
        visitsTable,
        plansTable: cleaningPlansTable,
        detailsTable: cleaningDetailsTable || '',
        persistSummary: false,
      }),
      buildMaintenanceMonthDetail({
        monthId,
        persistSummary: false,
        billingTable: maintenanceBillingTable,
        visitsTable,
        settingsTable: maintenanceSettingsTable,
        providersTable,
        visitTypesTable,
        propertiesTable,
      }),
      loadPendingBillingExpenses(subtractionsTable, property, monthId),
      loadFinanceMovements(movementsTable, property, monthId),
      loadFinanceServices(servicesTable, property, monthId),
    ]);

    const expenses = [...subtractionExpenses, ...movementExpenses].sort(
      (left, right) => {
        if (left.date !== right.date) {
          return left.date.localeCompare(right.date);
        }
        return left.id.localeCompare(right.id);
      },
    );

    const cleaningClosed = cleaningDetail.month.status === 'CLOSED';
    const maintenanceClosed = maintenanceDetail.month.status === 'CLOSED';
    const cleaningLines = cleaningClosed
      ? cleaningDetail.lines.filter((line) => line.propertyId === propertyId)
      : [];
    const maintenanceLines = maintenanceClosed
      ? maintenanceDetail.lines.filter(
          (line) => line.propertyId === propertyId && !line.dismissed,
        )
      : [];

    return buildHttpResponse(200, {
      property: {
        id: propertyId,
        name:
          asString(property.nickname) ||
          asString(property.listingNickname) ||
          asString(property.title) ||
          propertyId,
      },
      months,
      report,
      bookings,
      cleaning: {
        status: cleaningDetail.month.status,
        closed: cleaningClosed,
        lines: cleaningLines,
        total: cleaningLines.reduce((sum, line) => sum + (line.price ?? 0), 0),
      },
      maintenance: {
        status: maintenanceDetail.month.status,
        closed: maintenanceClosed,
        lines: maintenanceLines,
        total: maintenanceLines.reduce((sum, line) => sum + (line.price ?? 0), 0),
      },
      expenses: {
        lines: expenses,
        count: expenses.length,
        totalCost: roundMoney(
          expenses.reduce((sum, line) => sum + line.amountExclIva, 0),
        ),
        totalCostWithIva: roundMoney(
          expenses.reduce((sum, line) => sum + line.amountInclIva, 0),
        ),
      },
      services: {
        lines: serviceLines,
        count: serviceLines.length,
        cost: roundMoney(serviceLines.reduce((sum, line) => sum + line.price, 0)),
        costWithIva: roundMoney(
          serviceLines.reduce((sum, line) => sum + line.priceWithIva, 0),
        ),
      },
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to load the property report.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
