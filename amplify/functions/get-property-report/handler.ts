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
  getReportRecord,
  isMonthIdValue,
  isPropertyReportEligible,
  isReportableMonth,
  listingMatchesProperty,
  listProperties,
  listReportMonthIds,
  loadDirectPurchases,
  loadFinanceMovements,
  loadFinanceServices,
  loadPendingBillingExpenses,
  mapReportBooking,
  parseLineAllocations,
  queryBookingsByCheckInDate,
  reportMonthSummary,
  reportScopeForProperty,
  reservationFromPayload,
  resolveReportProperty,
  roundMoney,
} from '../shared/property-reports';
import {
  parseReportSettings,
  REPORT_SETTINGS_MONTH_ID,
} from '../shared/property-report-settings';

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
  const purchasesTable = process.env.PURCHASES_TABLE;

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
    !servicesTable ||
    !purchasesTable
  ) {
    return buildHttpResponse(500, {
      message: 'Property report tables are not configured.',
    });
  }

  const propertyId = event.queryStringParameters?.propertyId?.trim();
  const monthId = event.queryStringParameters?.month?.trim();
  const settingsOnly =
    event.queryStringParameters?.settings === '1' ||
    event.queryStringParameters?.settings === 'true';
  if (!propertyId) {
    return buildHttpResponse(400, { message: 'propertyId is required.' });
  }

  try {
    const properties = await listProperties(propertiesTable);
    const resolved = resolveReportProperty(properties, propertyId);
    if (resolved.memberGroup) {
      return buildHttpResponse(404, {
        message: `This property is reported together under ${resolved.memberGroup.name}.`,
      });
    }
    const property = resolved.property;
    if (!property || !isPropertyReportEligible(property, resolved.groups)) {
      return buildHttpResponse(404, {
        message: 'Property is not available in Property Reports.',
      });
    }

    const scope = reportScopeForProperty(property);
    const loadSettings = async () => {
      const stored = await getReportRecord(
        reportsTable,
        propertyId,
        REPORT_SETTINGS_MONTH_ID,
      );
      return parseReportSettings(stored);
    };

    if (settingsOnly) {
      return buildHttpResponse(200, {
        property: {
          id: scope.id,
          name: scope.name,
        },
        settings: await loadSettings(),
      });
    }

    const months = [];
    for (const id of listReportMonthIds()) {
      const stored = await getReportRecord(reportsTable, propertyId, id);
      months.push(reportMonthSummary(id, stored));
    }

    if (!monthId) {
      return buildHttpResponse(200, {
        property: {
          id: scope.id,
          name: scope.name,
        },
        months,
        settings: await loadSettings(),
      });
    }

    if (!isMonthIdValue(monthId) || !isReportableMonth(monthId)) {
      return buildHttpResponse(404, {
        message: 'Month is not available in Property Reports.',
      });
    }

    const stored = await getReportRecord(reportsTable, propertyId, monthId);
    const report = reportMonthSummary(monthId, stored);
    const lineAllocations = parseLineAllocations(stored?.lineAllocations);

    const [
      bookings,
      cleaningDetail,
      maintenanceDetail,
      subtractionExpenses,
      movementExpenses,
      serviceLines,
      purchaseExpenses,
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
      loadDirectPurchases(purchasesTable, property, monthId),
    ]);

    const expenses = [
      ...subtractionExpenses,
      ...movementExpenses,
      ...purchaseExpenses,
    ].sort(
      (left, right) => {
        if (left.date !== right.date) {
          return left.date.localeCompare(right.date);
        }
        return left.id.localeCompare(right.id);
      },
    );

    const cleaningClosed = cleaningDetail.month.status === 'CLOSED';
    const maintenanceClosed = maintenanceDetail.month.status === 'CLOSED';
    const cleaningLines = cleaningDetail.lines.filter((line) =>
      scope.memberIds.includes(line.propertyId),
    );
    const maintenanceLines = maintenanceDetail.lines.filter(
      (line) => scope.memberIds.includes(line.propertyId) && !line.dismissed,
    );
    const cleaningKitCost = roundMoney(
      cleaningLines.reduce((sum, line) => sum + (line.kit?.cost ?? 0), 0),
    );
    const cleaningKitCostWithIva = roundMoney(
      cleaningLines.reduce(
        (sum, line) => sum + (line.kit?.costWithIva ?? 0),
        0,
      ),
    );

    return buildHttpResponse(200, {
      property: {
        id: scope.id,
        name: scope.name,
      },
      months,
      report,
      lineAllocations,
      bookings,
      cleaning: {
        status: cleaningDetail.month.status,
        closed: cleaningClosed,
        lines: cleaningLines,
        total: cleaningLines.reduce((sum, line) => sum + (line.price ?? 0), 0),
        kitCost: cleaningKitCost,
        kitCostWithIva: cleaningKitCostWithIva,
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
