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
  asMergedGroups,
  asNumber,
  asOverrides,
  asString,
  buildMonthDetail,
  currentMonthId,
  deriveMonthStatus,
  flattenMergeSelection,
  getMonthRecord,
  isApprovedOrAbove,
  isBillingStatus,
  isMonthId,
  newMergedGroupId,
  nextBillingStatus,
  roundMoney,
  type LineOverride,
  type ManualBillingLine,
  type MergedBillingGroup,
} from '../shared/maintenance-billing';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  action?: string;
  month?: string;
  visitId?: string;
  lineId?: string;
  lineIds?: unknown;
  title?: string;
  date?: string;
  propertyId?: string;
  property?: string;
  visitTypeId?: string;
  visitTypeName?: string;
  providerId?: string;
  providerName?: string;
  hours?: number | null;
  price?: number | null;
  hoursDisabled?: boolean;
  billingStatus?: string;
  dismissed?: boolean;
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
    mergedGroups: patch.mergedGroups ?? asMergedGroups(existing.mergedGroups),
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
      if (detail.lines.length === 0) {
        return buildHttpResponse(400, {
          message:
            'Every line must be Approved, Billed, or Paid before closing the month.',
        });
      }
      if (
        detail.lines.filter((line) => !line.dismissed).some(
          (line) => !isApprovedOrAbove(line.billingStatus),
        )
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
          dismissed:
            payload.dismissed === undefined
              ? Boolean(current.dismissed)
              : Boolean(payload.dismissed),
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
        const title = asString(payload.title);
        const propertyId = asString(payload.propertyId);
        const property = asString(payload.property) || propertyId;
        if (!title || !propertyId || !providerId || price === null) {
          return buildHttpResponse(400, {
            message: 'title, propertyId, provider, and price are required.',
          });
        }
        const hoursDisabled = Boolean(payload.hoursDisabled);
        const hours = hoursDisabled ? 0 : (asNumber(payload.hours) ?? 0);
        const line: ManualBillingLine = {
          id:
            asString(payload.lineId) ||
            `ML-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          date,
          propertyId,
          property,
          providerId,
          providerName,
          hours,
          hoursDisabled,
          price,
          billingStatus: isBillingStatus(payload.billingStatus)
            ? payload.billingStatus
            : 'WAITING_APPROVAL',
          dismissed:
            payload.dismissed === undefined
              ? Boolean(
                  manualLines.find(
                    (item) =>
                      item.id ===
                      (asString(payload.lineId) || ''),
                  )?.dismissed,
                )
              : Boolean(payload.dismissed),
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
    } else if (action === 'merge') {
      const lineIds = Array.isArray(payload.lineIds)
        ? payload.lineIds.map((entry) => asString(entry)).filter(Boolean)
        : [];
      const detail = await buildMonthDetail({ monthId, ...context });
      const selected = lineIds
        .map((id) => detail.lines.find((line) => line.id === id))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));
      if (selected.length !== lineIds.length || selected.length < 2) {
        return buildHttpResponse(400, {
          message: 'Select at least two billing lines from this month.',
        });
      }
      if (selected.some((line) => line.billingStatus !== 'TO_ESTIMATE')) {
        return buildHttpResponse(400, {
          message: 'Only To Estimate lines can be grouped.',
        });
      }
      const propertyId = asString(selected[0].propertyId) || selected[0].id;
      const flattened = flattenMergeSelection(selected);
      if (flattened.visitIds.length + flattened.manualLineIds.length < 2) {
        return buildHttpResponse(400, {
          message: 'A group needs at least two visits or manual lines.',
        });
      }
      const date = asString(payload.date).slice(0, 10) || selected[0].date;
      if (!date.startsWith(`${monthId}-`)) {
        return buildHttpResponse(400, {
          message: 'The grouped date must stay inside the selected month.',
        });
      }
      const title = asString(payload.title) || selected[0].title;
      if (!title) {
        return buildHttpResponse(400, { message: 'title is required.' });
      }
      const hoursDisabled = Boolean(payload.hoursDisabled);
      const hours = hoursDisabled ? 0 : asNumber(payload.hours);
      const price = hoursDisabled
        ? asNumber(payload.price)
        : hours !== null && hours > 0
          ? roundMoney(hours * detail.settings.hourlyCost)
          : asNumber(payload.price);
      const existingGroups = asMergedGroups(stored?.mergedGroups).filter(
        (group) => !flattened.groupIds.includes(group.id),
      );
      const memberAlreadyGrouped = existingGroups.some(
        (group) =>
          group.visitIds.some((id) => flattened.visitIds.includes(id)) ||
          group.manualLineIds.some((id) => flattened.manualLineIds.includes(id)),
      );
      if (memberAlreadyGrouped) {
        return buildHttpResponse(400, {
          message: 'One of the selected lines already belongs to another group.',
        });
      }
      const keepId = flattened.groupIds[0] || newMergedGroupId();
      const first = selected[0];
      const group: MergedBillingGroup = {
        id: keepId,
        title,
        date,
        propertyId,
        property:
          asString(payload.property) || first.property || propertyId,
        visitTypeId: asString(payload.visitTypeId) || first.visitTypeId,
        visitTypeName: asString(payload.visitTypeName) || first.visitTypeName,
        providerId:
          asString(payload.providerId) ||
          first.providerId ||
          detail.settings.defaultProviderId,
        providerName:
          asString(payload.providerName) ||
          first.providerName ||
          detail.settings.defaultProviderName,
        hours,
        hoursDisabled,
        price,
        billingStatus: 'TO_ESTIMATE',
        visitIds: flattened.visitIds,
        manualLineIds: flattened.manualLineIds,
      };
      await persistRecord(context.billingTable, monthId, {
        mergedGroups: [...existingGroups, group],
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: group.id,
        entityName: monthId,
        summary: `merged maintenance billing group ${quoted(group.id)} in ${quoted(monthId)}`,
      });
    } else if (action === 'unmerge') {
      const lineId = asString(payload.lineId);
      const mergedGroups = asMergedGroups(stored?.mergedGroups);
      if (!mergedGroups.some((group) => group.id === lineId)) {
        return buildHttpResponse(404, { message: 'Grouped line not found.' });
      }
      await persistRecord(context.billingTable, monthId, {
        mergedGroups: mergedGroups.filter((group) => group.id !== lineId),
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: lineId,
        entityName: monthId,
        summary: `ungrouped maintenance billing ${quoted(lineId)} in ${quoted(monthId)}`,
      });
    } else if (action === 'advance-group' || action === 'override-group') {
      const lineId = asString(payload.lineId);
      const detail = await buildMonthDetail({ monthId, ...context });
      const line = detail.lines.find(
        (entry) => entry.source === 'group' && entry.id === lineId,
      );
      if (!line) {
        return buildHttpResponse(404, { message: 'Grouped line not found.' });
      }
      const mergedGroups = asMergedGroups(stored?.mergedGroups);
      const index = mergedGroups.findIndex((group) => group.id === lineId);
      if (index < 0) {
        return buildHttpResponse(404, { message: 'Grouped line not found.' });
      }
      const current = mergedGroups[index];
      if (action === 'advance-group') {
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
        mergedGroups[index] = {
          ...current,
          providerId: line.providerId,
          providerName: line.providerName,
          hours: line.hours,
          hoursDisabled: line.hoursDisabled,
          price: line.price,
          billingStatus: next,
        };
      } else {
        const date = asString(payload.date).slice(0, 10) || current.date;
        if (!date.startsWith(`${monthId}-`)) {
          return buildHttpResponse(400, {
            message: 'The grouped date must stay inside the selected month.',
          });
        }
        const hoursDisabled = Boolean(payload.hoursDisabled);
        const hours = hoursDisabled ? 0 : asNumber(payload.hours);
        const price = hoursDisabled
          ? asNumber(payload.price)
          : hours !== null && hours > 0
            ? roundMoney(hours * detail.settings.hourlyCost)
            : asNumber(payload.price);
        mergedGroups[index] = {
          ...current,
          title: asString(payload.title) || current.title,
          date,
          providerId: asString(payload.providerId) || current.providerId,
          providerName:
            asString(payload.providerName) || current.providerName,
          hours,
          hoursDisabled,
          price,
          billingStatus: isBillingStatus(payload.billingStatus)
            ? payload.billingStatus
            : current.billingStatus,
          dismissed:
            payload.dismissed === undefined
              ? Boolean(current.dismissed)
              : Boolean(payload.dismissed),
        };
      }
      await persistRecord(context.billingTable, monthId, { mergedGroups });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_BILLING,
        action: 'update',
        entityId: lineId,
        entityName: monthId,
        summary: `updated grouped maintenance billing ${quoted(lineId)} in ${quoted(monthId)}`,
      });
    } else if (action === 'delete-manual') {
      const lineId = asString(payload.lineId);
      const manualLines = asManualLines(stored?.manualLines).filter(
        (item) => item.id !== lineId,
      );
      const mergedGroups = asMergedGroups(stored?.mergedGroups)
        .map((group) => ({
          ...group,
          manualLineIds: group.manualLineIds.filter((id) => id !== lineId),
        }))
        .filter((group) => group.visitIds.length + group.manualLineIds.length > 0);
      await persistRecord(context.billingTable, monthId, {
        manualLines,
        mergedGroups,
      });
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
