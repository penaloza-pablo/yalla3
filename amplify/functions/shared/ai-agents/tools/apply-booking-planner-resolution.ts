import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { LOG_FEATURES, quoted, recordActivityLog } from '../../activity-log';
import {
  parsePlannerResolutionArgs,
  warningLabel,
} from '../../booking-plan-warning-cleaner';
import {
  applyPlannerToReservation,
  getPlannerSettings,
} from '../../bookings-planner-apply';
import { notifyBookingPlanWarningCleared } from '../../slack-booking-plan-warning';
import { docClient } from '../../visit-task-utils';
import type { AgentTool, ToolResult } from '../types';
import { TOOL_CATALOG_VERSION } from './metadata';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {
    reservationId: {
      type: 'string',
      description: 'Yalla / Guesty reservation id to update on Booking Plan.',
    },
    warningCode: {
      type: 'string',
      enum: ['linen_ask_guest', 'double_or_two_singles_ask', 'single_guest'],
      description: 'Open Booking Plan warning this write resolves.',
    },
    value: {
      type: 'string',
      description:
        'Canonical field value. linen_ask_guest: "Sofa cama: si" or "Sofa cama: no". double_or_two_singles_ask: "Double" or "Single". single_guest: omit or "dismiss".',
    },
    quote: {
      type: 'string',
      description: 'Exact guest message that justifies the write.',
    },
    confidence: {
      type: 'string',
      enum: ['high'],
      description: 'Must be "high". Any other value is rejected and nothing is written.',
    },
  },
  required: ['reservationId', 'warningCode', 'quote', 'confidence'],
  additionalProperties: false,
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const loadBooking = async (tableName: string, reservationId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { ReservationID: reservationId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

export const applyBookingPlannerResolutionTool: AgentTool = {
  id: 'apply_booking_planner_resolution',
  name: 'apply_booking_planner_resolution',
  description:
    'Writes a Booking Plan field after the agent is fully confident from a guest inbox message. linen_ask_guest sets Sofa cama si/no. double_or_two_singles_ask sets Double/Single. single_guest dismisses that warning. Rejects unless confidence is high. Does not read or interpret the conversation.',
  outputDescription:
    'JSON with reservationId, warningCode, value, persisted, syncedToGuesty, slackNotified.',
  riskLevel: 'write-controlled',
  requiresApproval: false,
  timeoutMs: 30_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      reservationId: { type: 'string' },
      warningCode: { type: 'string' },
      value: { type: 'string' },
      persisted: { type: 'boolean' },
      syncedToGuesty: { type: 'boolean' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const parsed = parsePlannerResolutionArgs(args);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const settingsTable =
      process.env.BOOKINGS_PLANNER_SETTINGS_TABLE ||
      process.env.TABLE_NAME ||
      'yalla-bookings-planner-settings';
    const settings = await getPlannerSettings(settingsTable);
    const result = await applyPlannerToReservation({
      bookingsTable,
      settings,
      reservationId: parsed.reservationId,
      overrides: {
        ...(parsed.linen ? { linen: parsed.linen } : {}),
        ...(parsed.dismissWarning
          ? { dismissWarning: parsed.dismissWarning }
          : {}),
      },
      syncGuesty: Boolean(parsed.linen),
    });
    if (!result.ok) {
      throw new Error('Booking not found.');
    }
    const booking = await loadBooking(bookingsTable, parsed.reservationId);
    const writtenValue =
      parsed.linen ||
      (parsed.dismissWarning ? 'dismissed' : '');
    if (!result.persisted) {
      return {
        content: {
          reservationId: parsed.reservationId,
          warningCode: parsed.warningCode,
          warning: warningLabel(parsed.warningCode),
          value: writtenValue,
          quote: parsed.quote,
          persisted: false,
          syncedToGuesty: Boolean(result.syncedToGuesty),
          slackNotified: false,
        },
        coverage: {
          planned: [
            {
              id: parsed.reservationId,
              label: asString(booking?.GuestName) || parsed.reservationId,
              detail: 'No Booking Plan change',
              source: 'Booking Plan warning cleaner',
            },
          ],
          unchecked: [],
        },
      };
    }
    const summary = parsed.dismissWarning
      ? `dismissed ${parsed.dismissWarning} for ${quoted(parsed.reservationId)}`
      : `set ${parsed.warningCode} to ${quoted(writtenValue)} for ${quoted(parsed.reservationId)}`;
    await recordActivityLog(
      {},
      {
        feature: LOG_FEATURES.BOOKINGS_PLAN,
        action: 'update',
        entityId: parsed.reservationId,
        entityName: asString(booking?.ConfirmationCode) || parsed.reservationId,
        userEmail: 'scheduler',
        propertyName: asString(booking?.ListingNickname),
        summary,
      },
    );
    let slackNotified = false;
    try {
      slackNotified = await notifyBookingPlanWarningCleared({
        reservationId: parsed.reservationId,
        warningCode: parsed.warningCode,
        value: writtenValue,
        quote: parsed.quote,
        guestName: asString(booking?.GuestName),
        property: asString(booking?.ListingNickname),
        confirmationCode: asString(booking?.ConfirmationCode),
      });
    } catch (error) {
      console.error(
        `Slack notify failed for Booking Plan warning ${parsed.reservationId}`,
        error,
      );
    }
    return {
      content: {
        reservationId: parsed.reservationId,
        warningCode: parsed.warningCode,
        warning: warningLabel(parsed.warningCode),
        value: writtenValue,
        quote: parsed.quote,
        persisted: result.persisted,
        syncedToGuesty: Boolean(result.syncedToGuesty),
        slackNotified,
      },
      coverage: {
        planned: [
          {
            id: parsed.reservationId,
            label: asString(booking?.GuestName) || parsed.reservationId,
            detail: `${parsed.warningCode} → ${writtenValue}`,
            source: 'Booking Plan warning cleaner',
          },
        ],
        unchecked: [],
      },
    };
  },
};
