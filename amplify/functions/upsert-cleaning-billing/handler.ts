import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  OTHER_CLEANING_TYPE_ID,
  asManualLines,
  asOverrides,
  buildMonthDetail,
  currentMonthId,
  deriveMonthStatus,
  getMonthRecord,
  isMonthId,
  type BillingOverride,
  type ManualBillingLine,
} from '../shared/cleaning-billing';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { normalizePrice as normalizeCleaningPrice } from '../shared/cleaning-plan';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  action?: string;
  month?: string;
  visitId?: string;
  lineId?: string;
  date?: string;
  propertyId?: string;
  property?: string;
  cleaningTypeId?: string;
  cleaningTypeName?: string;
  price?: number;
  isOther?: boolean;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

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

  const billingTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE || '';
  if (!billingTable || !visitsTable || !plansTable) {
    return buildHttpResponse(500, {
      message: 'Cleaning billing tables are not configured.',
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
  const stored = await getMonthRecord(billingTable, monthId);
  const status = deriveMonthStatus(monthId, asString(stored?.status));

  try {
    if (action === 'reopen') {
      if (status !== 'CLOSED') {
        return buildHttpResponse(400, { message: 'Only a closed month can be reopened.' });
      }
      await persistRecord(billingTable, monthId, {
        status: 'PENDING_TO_CLOSE',
        snapshotLines: undefined,
        closedAt: undefined,
        reopenedAt: nowIso(),
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_BILLING,
        action: 'update',
        entityId: monthId,
        entityName: monthId,
        summary: `reopened cleaning billing ${quoted(monthId)}`,
      });
    } else if (status === 'CLOSED') {
      return buildHttpResponse(400, {
        message: 'Reopen the month before making changes.',
      });
    } else if (action === 'close') {
      const detail = await buildMonthDetail({
        monthId,
        billingTable,
        visitsTable,
        plansTable,
        detailsTable,
      });
      if (monthId >= currentMonthId()) {
        return buildHttpResponse(400, {
          message: 'The current month cannot be closed.',
        });
      }
      if (detail.month.warningCount > 0) {
        return buildHttpResponse(400, {
          message: 'Resolve all warnings before closing the month.',
        });
      }
      const closedAt = nowIso();
      await persistRecord(billingTable, monthId, {
        status: 'CLOSED',
        snapshotLines: detail.lines,
        summary: {
          lineCount: detail.month.lineCount,
          completedCount: detail.month.completedCount,
          warningCount: 0,
          total: detail.month.total,
        },
        closedAt,
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_BILLING,
        action: 'update',
        entityId: monthId,
        entityName: monthId,
        summary: `closed cleaning billing ${quoted(monthId)}`,
      });
    } else if (action === 'override') {
      const visitId = asString(payload.visitId);
      if (!visitId) {
        return buildHttpResponse(400, { message: 'visitId is required.' });
      }
      const isOther =
        Boolean(payload.isOther) ||
        asString(payload.cleaningTypeId) === OTHER_CLEANING_TYPE_ID;
      const override: BillingOverride = {
        cleaningTypeId: isOther
          ? OTHER_CLEANING_TYPE_ID
          : asString(payload.cleaningTypeId),
        cleaningTypeName: asString(payload.cleaningTypeName),
        price: normalizeCleaningPrice(payload.price),
        isOther,
      };
      if (!override.cleaningTypeName) {
        return buildHttpResponse(400, { message: 'cleaningTypeName is required.' });
      }
      const overrides = asOverrides(stored?.overrides);
      overrides[visitId] = override;
      await persistRecord(billingTable, monthId, { overrides });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_BILLING,
        action: 'update',
        entityId: visitId,
        entityName: monthId,
        summary: `updated billing line ${quoted(visitId)} in ${quoted(monthId)}`,
      });
    } else if (action === 'add-manual' || action === 'update-manual') {
      const date = asString(payload.date).slice(0, 10);
      if (!date.startsWith(`${monthId}-`)) {
        return buildHttpResponse(400, {
          message: 'Manual lines need a date inside the selected month.',
        });
      }
      const isOther =
        Boolean(payload.isOther) ||
        asString(payload.cleaningTypeId) === OTHER_CLEANING_TYPE_ID;
      const line: ManualBillingLine = {
        id:
          asString(payload.lineId) ||
          `ML-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        propertyId: asString(payload.propertyId),
        property: asString(payload.property) || asString(payload.propertyId),
        cleaningTypeId: isOther
          ? OTHER_CLEANING_TYPE_ID
          : asString(payload.cleaningTypeId),
        cleaningTypeName: asString(payload.cleaningTypeName),
        price: normalizeCleaningPrice(payload.price),
        isOther,
      };
      if (!line.propertyId || !line.cleaningTypeName) {
        return buildHttpResponse(400, {
          message: 'propertyId and cleaningTypeName are required.',
        });
      }
      const manualLines = asManualLines(stored?.manualLines);
      const index = manualLines.findIndex((item) => item.id === line.id);
      if (action === 'update-manual') {
        if (index < 0) {
          return buildHttpResponse(404, { message: 'Manual line not found.' });
        }
        manualLines[index] = line;
      } else {
        manualLines.push(line);
      }
      await persistRecord(billingTable, monthId, { manualLines });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_BILLING,
        action: action === 'add-manual' ? 'create' : 'update',
        entityId: line.id,
        entityName: monthId,
        summary:
          action === 'add-manual'
            ? `added manual billing line ${quoted(line.property)} in ${quoted(monthId)}`
            : `updated manual billing line ${quoted(line.property)} in ${quoted(monthId)}`,
      });
    } else if (action === 'delete-manual') {
      const lineId = asString(payload.lineId);
      const manualLines = asManualLines(stored?.manualLines).filter(
        (item) => item.id !== lineId,
      );
      await persistRecord(billingTable, monthId, { manualLines });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_BILLING,
        action: 'delete',
        entityId: lineId,
        entityName: monthId,
        summary: `deleted manual billing line ${quoted(lineId)} in ${quoted(monthId)}`,
      });
    } else {
      return buildHttpResponse(400, { message: 'Unknown action.' });
    }

    const detail = await buildMonthDetail({
      monthId,
      billingTable,
      visitsTable,
      plansTable,
      detailsTable,
      persistSummary: true,
    });
    return buildHttpResponse(200, {
      month: detail.month,
      lines: detail.lines,
      count: detail.lines.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save cleaning billing.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
