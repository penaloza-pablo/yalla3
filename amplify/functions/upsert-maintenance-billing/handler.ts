import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  asManualLines,
  asNumber,
  asOverrides,
  asString,
  buildMonthDetail,
  currentMonthId,
  deriveMonthStatus,
  getMonthRecord,
  isApprovedOrAbove,
  isBillingStatus,
  isMonthId,
  nextBillingStatus,
  roundMoney,
  type LineOverride,
  type ManualBillingLine,
} from '../shared/maintenance-billing';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  action?: string;
  month?: string;
  visitId?: string;
  lineId?: string;
  date?: string;
  propertyId?: string;
  property?: string;
  providerId?: string;
  providerName?: string;
  hours?: number | null;
  price?: number | null;
  hoursDisabled?: boolean;
  billingStatus?: string;
};

const billingContext = () => {
  const billingTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const settingsTable = process.env.SETTINGS_TABLE;
  const providersTable = process.env.PROVIDERS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (
    !billingTable ||
    !visitsTable ||
    !settingsTable ||
    !providersTable ||
    !visitTypesTable ||
    !propertiesTable
  ) {
    return null;
  }
  return {
    billingTable,
    visitsTable,
    settingsTable,
    providersTable,
    visitTypesTable,
    propertiesTable,
  };
};

const persistRecord = async (
  tableName: string,
  monthId: string,
  patch: Record<string, unknown>,
) => {
  const existing = (await getMonthRecord(tableName, monthId)) ?? {};
  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    ...existing,
    ...patch,
    id: monthId,
    overrides: patch.overrides ?? asOverrides(existing.overrides),
    manualLines: patch.manualLines ?? asManualLines(existing.manualLines),
    createdAt: asString(existing.createdAt) || timestamp,
    updatedAt: timestamp,
  };
  Object.keys(item).forEach((key) => {
    if (item[key] === undefined) {
      delete item[key];
    }
  });
  await putItem(tableName, item);
  return item;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const context = billingContext();
  if (!context) {
    return buildHttpResponse(500, {
      message: 'Maintenance billing tables are not configured.',
    });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const monthId = asString(payload.month);
  if (!isMonthId(monthId)) {
    return buildHttpResponse(400, { message: 'month must be YYYY-MM.' });
  }

  const action = asString(payload.action).toLowerCase() || 'override';
  const stored = await getMonthRecord(context.billingTable, monthId);
  const status = deriveMonthStatus(monthId, asString(stored?.status));

  try {
    if (action === 'reopen') {
      if (status !== 'CLOSED') {
        return buildHttpResponse(400, {
          message: 'Only a closed month can be reopened.',
        });
      }
      await persistRecord(context.billingTable, monthId, {
        status: 'PENDING_TO_CLOSE',
        snapshotLines: undefined,
        closedAt: undefined,
        reopenedAt: nowIso(),
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: monthId,
        entityName: monthId,
        summary: `reopened maintenance billing ${quoted(monthId)}`,
      });
    } else if (status === 'CLOSED') {
      return buildHttpResponse(400, {
        message: 'Reopen the month before making changes.',
      });
    } else if (action === 'close') {
      const detail = await buildMonthDetail({ monthId, ...context });
      if (monthId >= currentMonthId()) {
        return buildHttpResponse(400, {
          message: 'The current month cannot be closed.',
        });
      }
      if (
        detail.lines.length === 0 ||
        detail.lines.some((line) => !isApprovedOrAbove(line.billingStatus))
      ) {
        return buildHttpResponse(400, {
          message:
            'Every line must be Approved, Billed, or Paid before closing the month.',
        });
      }
      const closedAt = nowIso();
      await persistRecord(context.billingTable, monthId, {
        status: 'CLOSED',
        snapshotLines: detail.lines,
        summary: {
          lineCount: detail.month.lineCount,
          completedCount: detail.month.completedCount,
          warningCount: 0,
          total: detail.month.total,
          validatedHours: detail.month.validatedHours,
        },
        closedAt,
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: monthId,
        entityName: monthId,
        summary: `closed maintenance billing ${quoted(monthId)}`,
      });
    } else if (action === 'advance' || action === 'override') {
      const visitId = asString(payload.visitId);
      if (!visitId) {
        return buildHttpResponse(400, { message: 'visitId is required.' });
      }
      const detail = await buildMonthDetail({ monthId, ...context });
      const line = detail.lines.find(
        (entry) => entry.source === 'visit' && entry.visitId === visitId,
      );
      if (!line) {
        return buildHttpResponse(404, { message: 'Visit line not found.' });
      }
      const overrides = asOverrides(stored?.overrides);
      const current = overrides[visitId] ?? {};
      if (action === 'advance') {
        if (line.price === null) {
          return buildHttpResponse(400, {
            message: 'Set a price before advancing billing status.',
          });
        }
        const next = nextBillingStatus(line.billingStatus);
        if (!next) {
          return buildHttpResponse(400, {
            message: 'Paid is the final billing status.',
          });
        }
        overrides[visitId] = {
          ...current,
          providerId: line.providerId,
          providerName: line.providerName,
          hours: line.hours,
          hoursDisabled: line.hoursDisabled,
          price: line.price,
          billingStatus: next,
        };
      } else {
        const hoursDisabled = Boolean(payload.hoursDisabled);
        const hours = hoursDisabled ? 0 : asNumber(payload.hours);
        const price = hoursDisabled
          ? asNumber(payload.price)
          : hours !== null && hours > 0
            ? roundMoney(hours * detail.settings.hourlyCost)
            : asNumber(payload.price);
        const billingStatus = isBillingStatus(payload.billingStatus)
          ? payload.billingStatus
          : line.billingStatus;
        const override: LineOverride = {
          providerId: asString(payload.providerId) || line.providerId,
          providerName: asString(payload.providerName) || line.providerName,
          hours,
          hoursDisabled,
          price,
          billingStatus,
        };
        if (!override.providerId) {
          return buildHttpResponse(400, { message: 'providerId is required.' });
        }
        overrides[visitId] = override;
      }
      await persistRecord(context.billingTable, monthId, { overrides });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: visitId,
        entityName: monthId,
        summary: `updated maintenance billing line ${quoted(visitId)} in ${quoted(monthId)}`,
      });
    } else if (action === 'advance-manual' || action === 'update-manual' || action === 'add-manual') {
      const manualLines = asManualLines(stored?.manualLines);
      if (action === 'advance-manual') {
        const lineId = asString(payload.lineId);
        const index = manualLines.findIndex((item) => item.id === lineId);
        if (index < 0) {
          return buildHttpResponse(404, { message: 'Manual line not found.' });
        }
        const next = nextBillingStatus(manualLines[index].billingStatus);
        if (!next) {
          return buildHttpResponse(400, {
            message: 'Paid is the final billing status.',
          });
        }
        manualLines[index] = { ...manualLines[index], billingStatus: next };
      } else {
        const date = asString(payload.date).slice(0, 10);
        if (!date.startsWith(`${monthId}-`)) {
          return buildHttpResponse(400, {
            message: 'Manual lines need a date inside the selected month.',
          });
        }
        const price = asNumber(payload.price);
        const providerId = asString(payload.providerId);
        const providerName = asString(payload.providerName) || providerId;
        if (!asString(payload.propertyId) || !providerId || price === null) {
          return buildHttpResponse(400, {
            message: 'propertyId, provider, and price are required.',
          });
        }
        const line: ManualBillingLine = {
          id:
            asString(payload.lineId) ||
            `ML-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          date,
          propertyId: asString(payload.propertyId),
          property: asString(payload.property) || asString(payload.propertyId),
          providerId,
          providerName,
          hours: 0,
          hoursDisabled: true,
          price,
          billingStatus: isBillingStatus(payload.billingStatus)
            ? payload.billingStatus
            : 'WAITING_APPROVAL',
        };
        const index = manualLines.findIndex((item) => item.id === line.id);
        if (action === 'update-manual') {
          if (index < 0) {
            return buildHttpResponse(404, { message: 'Manual line not found.' });
          }
          manualLines[index] = line;
        } else {
          manualLines.push(line);
        }
      }
      await persistRecord(context.billingTable, monthId, { manualLines });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: action === 'add-manual' ? 'create' : 'update',
        entityId: asString(payload.lineId),
        entityName: monthId,
        summary: `${action} maintenance billing line in ${quoted(monthId)}`,
      });
    } else if (action === 'delete-manual') {
      const lineId = asString(payload.lineId);
      const manualLines = asManualLines(stored?.manualLines).filter(
        (item) => item.id !== lineId,
      );
      await persistRecord(context.billingTable, monthId, { manualLines });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'delete',
        entityId: lineId,
        entityName: monthId,
        summary: `deleted manual maintenance billing line ${quoted(lineId)}`,
      });
    } else {
      return buildHttpResponse(400, { message: 'Unknown action.' });
    }

    const detail = await buildMonthDetail({
      monthId,
      persistSummary: true,
      ...context,
    });
    return buildHttpResponse(200, {
      month: detail.month,
      lines: detail.lines,
      settings: detail.settings,
      count: detail.lines.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save maintenance billing.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
