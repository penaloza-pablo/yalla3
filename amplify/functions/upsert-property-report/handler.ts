import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  deriveMonthStatus as deriveCleaningMonthStatus,
  getMonthRecord as getCleaningMonthRecord,
} from '../shared/cleaning-billing';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  deriveMonthStatus as deriveMaintenanceMonthStatus,
  getMonthRecord as getMaintenanceMonthRecord,
} from '../shared/maintenance-billing';
import { docClient, putItem } from '../shared/visit-task-utils';
import {
  asString,
  currentReportMonthId,
  deriveReportStatus,
  emptyReportRecord,
  isMonthIdValue,
  isPropertyReportEligible,
  isReportFrozen,
  isReportableMonth,
  listProperties,
  parseLineAllocations,
  previousReportStatus,
  reportScopeForProperty,
  resolveReportProperty,
  type LineAllocation,
  type PropertyReportStatus,
} from '../shared/property-reports';
import {
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  isGlobalReportSettingsId,
  parseReportSettings,
  REPORT_SETTINGS_MONTH_ID,
  validateReportSettings,
} from '../shared/property-report-settings';

type Payload = {
  propertyId?: string;
  monthId?: string;
  action?: string;
  lineAllocations?: Record<string, LineAllocation>;
  businessModel?: string;
  commissionPercent?: number | string | null;
  fixedRent?: number | string | null;
  markupPercent?: number | string | null;
  formula?: string | null;
  propertyContributionFormula?: string | null;
  ourProfitFormula?: string | null;
  netEarningsFormula?: string | null;
  cleaningVat?: number | string | null;
  accommodationVat?: number | string | null;
  airbnbFeePercent?: number | string | null;
  visibility?: unknown;
  conditions?: unknown[];
  marketManagementFee?: number | string | null;
};

const monthIsClosed = async (
  tableName: string | undefined,
  monthId: string,
  deriveStatus: typeof deriveCleaningMonthStatus,
  getMonth: typeof getCleaningMonthRecord,
) => {
  if (!tableName) {
    return false;
  }
  const stored = await getMonth(tableName, monthId);
  return deriveStatus(monthId, asString(stored?.status)) === 'CLOSED';
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

  const tableName = process.env.TABLE_NAME;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  const cleaningBillingTable = process.env.CLEANING_BILLING_TABLE;
  const maintenanceBillingTable = process.env.MAINTENANCE_BILLING_TABLE;
  if (!tableName || !propertiesTable) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const propertyId = payload.propertyId?.trim() ?? '';
  const action = asString(payload.action).toLowerCase();
  if (!propertyId) {
    return buildHttpResponse(400, {
      message: 'propertyId is required.',
    });
  }

  const saveSettingsItem = async (
    id: string,
    parsed: Extract<
      ReturnType<typeof validateReportSettings>,
      { ok: true }
    >,
    entityName: string,
  ) => {
    const foundSettings = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { propertyId: id, monthId: REPORT_SETTINGS_MONTH_ID },
      }),
    );
    const existingSettings = foundSettings.Item as
      | Record<string, unknown>
      | undefined;
    const timestamp = nowIso();
    const item = {
      propertyId: id,
      monthId: REPORT_SETTINGS_MONTH_ID,
      kind: 'settings',
      businessModel: parsed.settings.businessModel,
      commissionPercent: parsed.settings.commissionPercent,
      fixedRent: parsed.settings.fixedRent,
      markupPercent: parsed.settings.markupPercent,
      formula: parsed.settings.formula,
      managementFeeFormula: parsed.settings.formula,
      propertyContributionFormula: parsed.settings.propertyContributionFormula,
      ourProfitFormula: parsed.settings.ourProfitFormula,
      netEarningsFormula: parsed.settings.netEarningsFormula,
      cleaningVat: parsed.settings.cleaningVat,
      accommodationVat: parsed.settings.accommodationVat,
      airbnbFeePercent: parsed.settings.airbnbFeePercent,
      marketManagementFee: parsed.settings.marketManagementFee,
      visibility: parsed.settings.visibility,
      conditions: parsed.settings.conditions,
      createdAt: asString(existingSettings?.createdAt) || timestamp,
      updatedAt: timestamp,
    };
    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.PROPERTY_REPORTS,
      action: 'settings',
      entityId: `${id}#${REPORT_SETTINGS_MONTH_ID}`,
      entityName,
      summary: `updated property report settings ${quoted(entityName)}`,
    });
    return item;
  };

  if (action === 'settings' && isGlobalReportSettingsId(propertyId)) {
    const foundSettings = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          propertyId: GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
          monthId: REPORT_SETTINGS_MONTH_ID,
        },
      }),
    );
    const existing = parseReportSettings(
      foundSettings.Item as Record<string, unknown> | undefined,
    );
    const has = (key: keyof Payload) =>
      Object.prototype.hasOwnProperty.call(payload, key) &&
      payload[key] !== undefined;
    const parsed = validateReportSettings(
      parseReportSettings(
        {
          formula: has('formula') ? payload.formula : existing.formula,
          propertyContributionFormula: has('propertyContributionFormula')
            ? payload.propertyContributionFormula
            : existing.propertyContributionFormula,
          ourProfitFormula: has('ourProfitFormula')
            ? payload.ourProfitFormula
            : existing.ourProfitFormula,
          netEarningsFormula: has('netEarningsFormula')
            ? payload.netEarningsFormula
            : existing.netEarningsFormula,
          cleaningVat: has('cleaningVat')
            ? payload.cleaningVat
            : existing.cleaningVat,
          accommodationVat: has('accommodationVat')
            ? payload.accommodationVat
            : existing.accommodationVat,
          airbnbFeePercent: has('airbnbFeePercent')
            ? payload.airbnbFeePercent
            : existing.airbnbFeePercent,
          visibility: has('visibility')
            ? payload.visibility
            : existing.visibility,
          marketManagementFee: has('marketManagementFee')
            ? payload.marketManagementFee
            : existing.marketManagementFee,
        } as Record<string, unknown>,
        { persistVisibility: true },
      ),
      { global: true },
    );
    if (!parsed.ok) {
      return buildHttpResponse(400, { message: parsed.message });
    }
    try {
      const item = await saveSettingsItem(
        GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
        parsed,
        'Reports Settings',
      );
      return buildHttpResponse(200, {
        item,
        settings: parseReportSettings(item),
      });
    } catch (error) {
      return buildHttpResponse(500, {
        message: 'Failed to update the property report settings.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const properties = await listProperties(propertiesTable);
  const resolved = resolveReportProperty(properties, propertyId);
  if (resolved.memberGroup) {
    return buildHttpResponse(400, {
      message: `This property is reported together under ${resolved.memberGroup.name}.`,
    });
  }
  const property = resolved.property;
  if (!property || !isPropertyReportEligible(property, resolved.groups)) {
    return buildHttpResponse(404, {
      message: 'Property is not available in Property Reports.',
    });
  }

  if (action === 'settings') {
    const parsed = validateReportSettings(
      parseReportSettings(
        {
          businessModel: payload.businessModel,
          commissionPercent: payload.commissionPercent,
          fixedRent: payload.fixedRent,
          markupPercent: payload.markupPercent,
          formula: payload.formula,
          propertyContributionFormula: payload.propertyContributionFormula,
          ourProfitFormula: payload.ourProfitFormula,
          netEarningsFormula: payload.netEarningsFormula,
          cleaningVat: payload.cleaningVat,
          accommodationVat: payload.accommodationVat,
          airbnbFeePercent: payload.airbnbFeePercent,
          visibility: payload.visibility,
          conditions: payload.conditions,
        } as Record<string, unknown>,
        { persistVisibility: true },
      ),
    );
    if (!parsed.ok) {
      return buildHttpResponse(400, { message: parsed.message });
    }
    try {
      const name = reportScopeForProperty(property).name;
      const item = await saveSettingsItem(propertyId, parsed, name);
      return buildHttpResponse(200, {
        item,
        settings: parseReportSettings(item),
      });
    } catch (error) {
      return buildHttpResponse(500, {
        message: 'Failed to update the property report settings.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const monthId = payload.monthId?.trim() ?? '';
  if (!isMonthIdValue(monthId) || !isReportableMonth(monthId)) {
    return buildHttpResponse(400, {
      message: 'propertyId and a reportable monthId are required.',
    });
  }

  const found = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { propertyId, monthId },
    }),
  );
  const existing = found.Item as Record<string, unknown> | undefined;
  const currentStatus = deriveReportStatus(monthId, asString(existing?.status));

  let nextStatus: PropertyReportStatus = currentStatus;
  let nextAllocations = parseLineAllocations(existing?.lineAllocations);
  if (action === 'ready') {
    if (currentStatus !== 'IN_PROGRESS') {
      return buildHttpResponse(400, {
        message: 'Only an in-progress month can be marked ready to close.',
      });
    }
    if (monthId >= currentReportMonthId()) {
      return buildHttpResponse(400, {
        message: 'The current month cannot be marked ready to close yet.',
      });
    }
    const [cleaningClosed, maintenanceClosed] = await Promise.all([
      monthIsClosed(
        cleaningBillingTable,
        monthId,
        deriveCleaningMonthStatus,
        getCleaningMonthRecord,
      ),
      monthIsClosed(
        maintenanceBillingTable,
        monthId,
        deriveMaintenanceMonthStatus,
        getMaintenanceMonthRecord,
      ),
    ]);
    if (!cleaningClosed || !maintenanceClosed) {
      return buildHttpResponse(400, {
        message:
          'Cleaning and Maintenance billing for this month must be closed first.',
      });
    }
    nextStatus = 'READY_TO_CLOSE';
  } else if (action === 'close') {
    if (currentStatus !== 'READY_TO_CLOSE') {
      return buildHttpResponse(400, {
        message: 'Only a month marked ready to close can be marked ready to publish.',
      });
    }
    nextStatus = 'READY_TO_PUBLISH';
  } else if (action === 'publish') {
    if (currentStatus !== 'READY_TO_PUBLISH') {
      return buildHttpResponse(400, {
        message: 'Only a month marked ready to publish can be published.',
      });
    }
    nextStatus = 'PUBLISHED';
  } else if (action === 'reopen') {
    if (currentStatus === 'IN_PROGRESS') {
      return buildHttpResponse(400, {
        message: 'An in-progress month cannot be reopened.',
      });
    }
    nextStatus = previousReportStatus(currentStatus);
  } else if (action === 'allocate') {
    if (isReportFrozen(currentStatus)) {
      return buildHttpResponse(400, {
        message: 'Allocations can only be edited before the month is ready to publish.',
      });
    }
    nextAllocations = parseLineAllocations(payload.lineAllocations);
  } else {
    return buildHttpResponse(400, {
      message:
        'action must be ready, close, publish, reopen, allocate, or settings.',
    });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    ...(existing ?? emptyReportRecord(propertyId, monthId, nextStatus)),
    propertyId,
    monthId,
    status: nextStatus,
    lineAllocations: nextAllocations,
    updatedAt: timestamp,
  };
  if (nextStatus === 'READY_TO_PUBLISH' || nextStatus === 'PUBLISHED') {
    item.closedAt = asString(existing?.closedAt) || timestamp;
  } else {
    delete item.closedAt;
  }
  if (nextStatus === 'PUBLISHED') {
    item.publishedAt = asString(existing?.publishedAt) || timestamp;
  } else {
    delete item.publishedAt;
  }

  try {
    await putItem(tableName, item);
    const name = `${reportScopeForProperty(property).name} ${monthId}`;
    await recordActivityLog(event, {
      feature: LOG_FEATURES.PROPERTY_REPORTS,
      action:
        nextStatus === 'PUBLISHED'
          ? 'publish'
          : nextStatus === 'READY_TO_PUBLISH'
            ? 'close'
            : action,
      entityId: `${propertyId}#${monthId}`,
      entityName: name,
      summary:
        nextStatus === 'PUBLISHED'
          ? `published property report ${quoted(name)}`
          : action === 'allocate'
            ? `updated property report allocations ${quoted(name)}`
            : nextStatus === 'READY_TO_PUBLISH'
              ? `marked property report ready to publish ${quoted(name)}`
              : nextStatus === 'READY_TO_CLOSE'
                ? `marked property report ready ${quoted(name)}`
                : `reopened property report ${quoted(name)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to update the property report.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
