import { TOOL_CATALOG_VERSION } from './metadata';
import {
  BookingConversationError,
  listConversationPosts,
} from '../../booking-conversation';
import type { AgentTool, ToolResult } from '../types';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {
    reservationId: {
      type: 'string',
      description: 'Yalla / Guesty reservation id whose inbox thread should be read.',
    },
    includeLogs: {
      type: 'boolean',
      description:
        'When true, include system log posts (status changes). Defaults to false.',
    },
  },
  required: ['reservationId'],
  additionalProperties: false,
};

export const listBookingConversationTool: AgentTool = {
  id: 'list_booking_conversation',
  name: 'list_booking_conversation',
  description:
    'Reads the live Guesty inbox thread for a reservation. Uses Booking.ConversationID as a pointer and fetches posts from Guesty on demand. A thread may cover more than one reservation.',
  outputDescription:
    'JSON with conversationId, relatedReservationIds, fetchedAt, and posts[{id, body, moduleType, fromName, createdAt, isNote, isLog}].',
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 20_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      reservationId: { type: 'string' },
      conversationId: { type: 'string' },
      relatedReservationIds: { type: 'array' },
      fetchedAt: { type: 'string' },
      posts: { type: 'array' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const reservationId =
      typeof args.reservationId === 'string' ? args.reservationId.trim() : '';
    if (!reservationId) {
      throw new BookingConversationError(
        'INVALID_INPUT',
        'reservationId is required.',
      );
    }
    const includeLogs = args.includeLogs === true;
    const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const thread = await listConversationPosts({
      bookingsTable,
      reservationId,
      includeLogs,
    });
    return {
      content: {
        reservationId: thread.reservationId,
        conversationId: thread.conversationId,
        relatedReservationIds: thread.relatedReservationIds,
        relatedReservations: thread.relatedReservations,
        fetchedAt: thread.fetchedAt,
        suggestedModuleType: thread.suggestedModuleType,
        posts: thread.posts.map((post) => ({
          id: post.id,
          body: post.body,
          moduleType: post.moduleType,
          fromName: post.fromName,
          createdAt: post.createdAt,
          isNote: post.isNote,
          isLog: post.isLog,
        })),
      },
      coverage: {
        planned: [
          {
            id: thread.conversationId,
            label: reservationId,
            detail: `${thread.posts.length} posts`,
            source: 'Guesty conversation posts',
          },
        ],
        unchecked: [],
      },
    };
  },
};
