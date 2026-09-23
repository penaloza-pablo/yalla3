import { TOOL_CATALOG_VERSION } from './metadata';
import {
  BookingConversationError,
  sendConversationMessage,
} from '../../booking-conversation';
import type { AgentTool, ToolResult } from '../types';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {
    reservationId: {
      type: 'string',
      description: 'Yalla / Guesty reservation id whose inbox thread should receive the message.',
    },
    body: {
      type: 'string',
      description: 'Message text to send to the guest, or to save as an internal note.',
    },
    deliver: {
      type: 'boolean',
      default: true,
      description:
        'When true (default), deliver through Guesty Inbox. When false, save an internal note only.',
    },
    moduleType: {
      type: 'string',
      description:
        'Optional Guesty module: email, sms, whatsapp, airbnb2, or note. Defaults from the conversation channel.',
    },
  },
  required: ['reservationId', 'body'],
  additionalProperties: false,
};

export const sendBookingConversationMessageTool: AgentTool = {
  id: 'send_booking_conversation_message',
  name: 'send_booking_conversation_message',
  description:
    'Writes to the live Guesty inbox thread for a reservation. Does not store the message on the Booking item. deliver=true sends to the guest; deliver=false saves an internal note.',
  outputDescription:
    'JSON with conversationId, delivered, relatedReservationIds, and the posted message.',
  riskLevel: 'write-controlled',
  requiresApproval: true,
  timeoutMs: 20_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      delivered: { type: 'boolean' },
      relatedReservationIds: { type: 'array' },
      post: { type: 'object' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const reservationId =
      typeof args.reservationId === 'string' ? args.reservationId.trim() : '';
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    if (!reservationId || !body) {
      throw new BookingConversationError(
        'INVALID_INPUT',
        'reservationId and body are required.',
      );
    }
    const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const result = await sendConversationMessage({
      bookingsTable,
      reservationId,
      body,
      moduleType:
        typeof args.moduleType === 'string' ? args.moduleType : undefined,
      deliver: args.deliver !== false,
    });
    return {
      content: result,
      coverage: {
        planned: [
          {
            id: result.conversationId,
            label: reservationId,
            detail: result.delivered ? 'sent' : 'note',
            source: 'Guesty send-message',
          },
        ],
        unchecked: [],
      },
    };
  },
};
