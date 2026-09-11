import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { reconcileCleanerStatsFromPlans } from '../shared/cleaner-stats';
import { isPlanDateTooFarAhead } from '../shared/date-range';
import {
  addHoursToTime,
  getPlanByDate,
  isCleaningSettingsRecord,
  isDateOnly,
  normalizeCleaningTypes,
  normalizeStartTime,
  queryCleaningVisitsForDate,
  resolveCleaningType,
  scanAllItems,
} from '../shared/cleaning-plan';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { invokeGuestyTaskSync } from '../shared/guesty-sync';
import {
  describeCleaningPlanChanges,
  notifyCleaningPlanChanges,
  notifyCleaningPlanReopened,
  type CleaningPlanChangeItem,
} from '../shared/slack-cleaning';
import {
  isStartTimeAfterAfternoonCutoff,
  notifyPlanReadyWithLateVisits,
  visitSlackLabel,
  type LatePlanVisit,
} from '../shared/slack-plan-late-visit';
import {
  docClient,
  getTodayInMadrid,
  patchUserOriginatedRecord,
  putItem,
} from '../shared/visit-task-utils';

type PlanItemInput = {
  visitId?: string;
  cleanerId?: string;
  startTime?: string;
  qualityReview?: boolean;
  cleaningTypeId?: string;
};

type PlanPayload = {
  plannedDate?: string;
  action?: 'save' | 'ready' | 'reopen';
  items?: PlanItemInput[];
};

type SavedPlanItem = {
  visitId: string;
  propertyId: string;
  cleanerId: string;
  startTime: string;
  qualityReview: boolean;
  cleaningTypeId: string;
  cleaningTypeName: string;
  durationHours: number;
  price: number;
};

const loadCleaner = async (tableName: string | undefined, cleanerId: string) => {
  if (!tableName || !cleanerId) {
    return undefined;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: cleanerId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

const invokeGuestyStartTimeSync = async (visitId: string) =>
  invokeGuestyTaskSync({
    tableName: process.env.VISITS_TABLE || 'yalla-visits',
    id: visitId,
  });

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

  const plansTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const cleanersTable = process.env.CLEANERS_TABLE;
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE;
  if (!plansTable || !visitsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or VISITS_TABLE is not configured.',
    });
  }

  const payload = parseBody<PlanPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const plannedDate = payload.plannedDate?.trim();
  if (!isDateOnly(plannedDate)) {
    return buildHttpResponse(400, { message: 'plannedDate is required.' });
  }

  const action = payload.action?.trim().toLowerCase() || 'save';
  if (action !== 'save' && action !== 'ready' && action !== 'reopen') {
    return buildHttpResponse(400, { message: 'Invalid action.' });
  }

  try {
    const existing = await getPlanByDate(plansTable, plannedDate as string);
    const currentStatus =
      typeof existing?.status === 'string' ? existing.status.toUpperCase() : 'DRAFT';

    if (currentStatus === 'READY' && action === 'save') {
      return buildHttpResponse(400, {
        message: 'Ready plans cannot be edited. Reopen the plan first.',
      });
    }

    if (
      action === 'ready' &&
      isPlanDateTooFarAhead(plannedDate as string, getTodayInMadrid())
    ) {
      return buildHttpResponse(400, {
        message:
          'Days more than two days ahead can only be saved as a draft.',
      });
    }

    const visits = await queryCleaningVisitsForDate(
      visitsTable,
      plannedDate as string,
    );
    const visitById = new Map(
      visits
        .filter((visit) => typeof visit.id === 'string')
        .map((visit) => [visit.id as string, visit]),
    );
    const detailItems = detailsTable ? await scanAllItems(detailsTable) : [];
    const detailsByPropertyId = new Map(
      detailItems
        .filter((item) => !isCleaningSettingsRecord(item))
        .map((item) => {
          const propertyId =
            typeof item.propertyId === 'string'
              ? item.propertyId
              : typeof item.id === 'string'
                ? item.id
                : '';
          return [propertyId, normalizeCleaningTypes(item.cleaningTypes)];
        }),
    );

    const incomingItems = Array.isArray(payload.items)
      ? payload.items
      : action === 'reopen' && Array.isArray(existing?.items)
        ? (existing.items as PlanItemInput[])
        : [];
    const normalizedItems: SavedPlanItem[] = [];

    for (const draft of incomingItems) {
      const visitId = draft.visitId?.trim();
      if (!visitId) {
        continue;
      }
      const visit = visitById.get(visitId);
      if (!visit) {
        continue;
      }
      const cleanerId = draft.cleanerId?.trim() ?? '';
      if (cleanerId && action !== 'reopen') {
        const cleaner = await loadCleaner(cleanersTable, cleanerId);
        if (!cleaner || cleaner.active === false) {
          return buildHttpResponse(400, {
            message: `Cleaner ${cleanerId} is not available.`,
            visitId,
          });
        }
      }
      const startTime = normalizeStartTime(draft.startTime);
      const propertyId =
        typeof visit.propertyId === 'string' ? visit.propertyId : '';
      const selectedType = resolveCleaningType(
        detailsByPropertyId.get(propertyId) ?? [],
        draft.cleaningTypeId,
      );
      normalizedItems.push({
        visitId,
        propertyId,
        cleanerId,
        startTime,
        qualityReview: Boolean(draft.qualityReview),
        cleaningTypeId: selectedType?.id ?? '',
        cleaningTypeName: selectedType?.name ?? '',
        durationHours: selectedType?.durationHours ?? 0,
        price: selectedType?.price ?? 0,
      });
    }

    if (action === 'ready') {
      const missing = visits.filter((visit) => {
        const visitId = typeof visit.id === 'string' ? visit.id : '';
        const saved = normalizedItems.find((item) => item.visitId === visitId);
        return !saved?.cleanerId || !saved.startTime;
      });
      if (missing.length > 0) {
        return buildHttpResponse(400, {
          message:
            'Every cleaning visit needs a cleaner and a start time before the plan can be marked ready.',
          missingCount: missing.length,
        });
      }
    }

    const nextStatus =
      action === 'ready' ? 'READY' : action === 'reopen' ? 'DRAFT' : 'DRAFT';
    const timestamp = nowIso();
    const item: Record<string, unknown> = {
      id: plannedDate,
      plannedDate,
      status: nextStatus,
      items: normalizedItems,
      createdAt:
        (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
        timestamp,
      updatedAt: timestamp,
    };

    if (nextStatus === 'READY') {
      item.readyAt = timestamp;
    } else if (typeof existing?.readyAt === 'string') {
      item.readyAt = existing.readyAt;
    }

    const snapshotItems = Array.isArray(existing?.slackSnapshot)
      ? (existing.slackSnapshot as SavedPlanItem[])
      : [];
    if (action === 'reopen' && currentStatus === 'READY') {
      item.slackSnapshot = existing?.items ?? [];
    } else if (action !== 'ready' && snapshotItems.length > 0) {
      item.slackSnapshot = snapshotItems;
    }

    await putItem(plansTable, item);

    if (action === 'ready') {
      try {
        const lateVisits: LatePlanVisit[] = [];
        for (const planItem of normalizedItems) {
          if (!isStartTimeAfterAfternoonCutoff(planItem.startTime)) {
            continue;
          }
          const visit = visitById.get(planItem.visitId);
          const cleaner = planItem.cleanerId
            ? await loadCleaner(cleanersTable, planItem.cleanerId)
            : undefined;
          lateVisits.push({
            visitId: planItem.visitId,
            title: visitSlackLabel(visit, planItem.visitId),
            startTime: planItem.startTime,
            assigneeName:
              typeof cleaner?.name === 'string' ? cleaner.name.trim() : '',
          });
        }
        await notifyPlanReadyWithLateVisits({
          kind: 'cleaning',
          plannedDate: plannedDate as string,
          visits: lateVisits,
        });
      } catch (error) {
        console.error(
          'Failed to notify Slack of late afternoon cleaning visits',
          error,
        );
      }
    }

    if (action === 'reopen' && currentStatus === 'READY') {
      try {
        await notifyCleaningPlanReopened(plannedDate as string);
      } catch (error) {
        console.error('Failed to notify Slack of cleaning plan reopen', error);
      }
    }

    if (action !== 'reopen' && snapshotItems.length > 0) {
      try {
        const cleanerNameById = new Map<string, string>();
        const loadCleanerName = async (cleanerId: string) => {
          const id = cleanerId.trim();
          if (!id) {
            return '';
          }
          const cached = cleanerNameById.get(id);
          if (cached !== undefined) {
            return cached;
          }
          const cleaner = await loadCleaner(cleanersTable, id);
          const name =
            typeof cleaner?.name === 'string' ? cleaner.name.trim() : id;
          cleanerNameById.set(id, name);
          return name;
        };
        const toChangeItem = async (planItem: {
          visitId?: string;
          cleanerId?: string;
          startTime?: string;
          cleaningTypeName?: string;
          qualityReview?: boolean;
        }): Promise<CleaningPlanChangeItem> => {
          const visitId = typeof planItem.visitId === 'string' ? planItem.visitId : '';
          const visit = visitById.get(visitId);
          const title =
            typeof visit?.title === 'string' && visit.title.trim()
              ? visit.title.trim()
              : visitId;
          return {
            visitId,
            title,
            cleanerName: await loadCleanerName(
              typeof planItem.cleanerId === 'string' ? planItem.cleanerId : '',
            ),
            startTime:
              typeof planItem.startTime === 'string' ? planItem.startTime : '',
            cleaningTypeName:
              typeof planItem.cleaningTypeName === 'string'
                ? planItem.cleaningTypeName
                : '',
            qualityReview: Boolean(planItem.qualityReview),
          };
        };
        const previous = await Promise.all(snapshotItems.map(toChangeItem));
        const next = await Promise.all(normalizedItems.map(toChangeItem));
        const changes = describeCleaningPlanChanges(previous, next);
        if (changes.length > 0) {
          await notifyCleaningPlanChanges(plannedDate as string, changes);
          if (action !== 'ready') {
            await putItem(plansTable, {
              ...item,
              slackSnapshot: normalizedItems,
            });
          }
        }
      } catch (error) {
        console.error('Failed to notify Slack of cleaning plan changes', error);
      }
    }

    try {
      await reconcileCleanerStatsFromPlans();
    } catch (error) {
      console.error('Failed to reconcile cleaner stats', error);
    }

    const syncedVisitIds: string[] = [];
    const syncErrors: { visitId: string; error: string }[] = [];

    if (action !== 'reopen') {
      for (const planItem of normalizedItems) {
        const visit = visitById.get(planItem.visitId);
        if (!visit || !planItem.startTime) {
          continue;
        }
        const currentStart =
          typeof visit.scheduledStartTime === 'string'
            ? visit.scheduledStartTime
            : '';
        const currentEnd =
          typeof visit.scheduledEndTime === 'string'
            ? visit.scheduledEndTime
            : '';
        const currentDurationMinutes = Number(visit.estimatedDurationMinutes);
        const endTime =
          planItem.durationHours > 0
            ? addHoursToTime(planItem.startTime, planItem.durationHours)
            : '';
        const durationMinutes =
          planItem.durationHours > 0
            ? Math.round(planItem.durationHours * 60)
            : undefined;
        const startChanged = currentStart !== planItem.startTime;
        const endChanged = Boolean(endTime) && currentEnd !== endTime;
        const durationChanged =
          durationMinutes !== undefined &&
          currentDurationMinutes !== durationMinutes;
        if (!startChanged && !endChanged && !durationChanged) {
          continue;
        }

        const setFields: Record<string, unknown> = {
          scheduledStartTime: planItem.startTime,
        };
        if (endTime) {
          setFields.scheduledEndTime = endTime;
        }
        if (durationMinutes !== undefined) {
          setFields.estimatedDurationMinutes = durationMinutes;
        }

        await patchUserOriginatedRecord(visitsTable, planItem.visitId, {
          set: setFields,
        });

        const guestyTaskId =
          typeof visit.guestyTaskId === 'string' ? visit.guestyTaskId : '';
        if (!guestyTaskId) {
          continue;
        }

        try {
          const syncResult = await invokeGuestyStartTimeSync(planItem.visitId);
          if (!syncResult.ok) {
            syncErrors.push({
              visitId: planItem.visitId,
              error: syncResult.error || 'Guesty sync failed.',
            });
            continue;
          }
          syncedVisitIds.push(planItem.visitId);
          // Guesty echoes the update as UTC; re-assert Madrid wall times for Daily Ops.
          const reassert: Record<string, unknown> = {
            scheduledStartTime: planItem.startTime,
          };
          if (endTime) {
            reassert.scheduledEndTime = endTime;
          }
          if (durationMinutes !== undefined) {
            reassert.estimatedDurationMinutes = durationMinutes;
          }
          await patchUserOriginatedRecord(visitsTable, planItem.visitId, {
            set: reassert,
          });
        } catch (error) {
          syncErrors.push({
            visitId: planItem.visitId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const summaryAction =
      action === 'ready'
        ? `marked cleaning plan ${quoted(plannedDate)} as ready`
        : action === 'reopen'
          ? `reopened cleaning plan ${quoted(plannedDate)}`
          : `saved cleaning plan ${quoted(plannedDate)}`;

    await recordActivityLog(event, {
      feature: LOG_FEATURES.CLEANING_PLAN,
      action,
      entityId: plannedDate,
      entityName: plannedDate,
      summary: summaryAction,
    });

    return buildHttpResponse(200, {
      item,
      syncedVisitIds,
      syncErrors,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save cleaning plan.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
