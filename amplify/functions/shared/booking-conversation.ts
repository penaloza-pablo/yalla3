import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { nowIso } from './dynamo-http';
import {
  asRecord,
  fetchGuestyReservation,
  isGuestyNotFound,
  loadGuestyClient,
  type GuestyClient,
} from './guesty-client';
import { docClient } from './visit-task-utils';

export type BookingConversationErrorCode =
  | 'GUESTY_UNAVAILABLE'
  | 'BOOKING_NOT_FOUND'
  | 'CONVERSATION_NOT_FOUND'
  | 'INVALID_INPUT';

export class BookingConversationError extends Error {
  readonly code: BookingConversationErrorCode;
  readonly statusCode: number;

  constructor(code: BookingConversationErrorCode, message: string) {
    super(message);
    this.name = 'BookingConversationError';
    this.code = code;
    this.statusCode =
      code === 'INVALID_INPUT'
        ? 400
        : code === 'GUESTY_UNAVAILABLE'
          ? 503
          : 404;
  }
}

export type RelatedReservation = {
  id: string;
  confirmationCode?: string;
  status?: string;
};

export type ConversationPost = {
  id: string;
  body: string;
  moduleType: string;
  sentBy?: string;
  fromName?: string;
  createdAt: string;
  reservationId?: string;
  isNote: boolean;
  isLog: boolean;
};

export type ConversationThread = {
  reservationId: string;
  conversationId: string;
  relatedReservationIds: string[];
  relatedReservations: RelatedReservation[];
  fetchedAt: string;
  posts: ConversationPost[];
  cursor?: { after?: string; before?: string };
  integrationPlatform?: string;
  suggestedModuleType: string;
};

export type ListConversationPostsInput = {
  bookingsTable: string;
  reservationId: string;
  cursorAfter?: string;
  includeLogs?: boolean;
};

export type SendConversationMessageInput = {
  bookingsTable: string;
  reservationId: string;
  body: string;
  moduleType?: string;
  deliver?: boolean;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const extractConversationId = (source: unknown) => {
  const record = asRecord(source);
  if (!record) {
    return '';
  }
  const direct = asString(record.conversationId) || asString(record.ConversationID);
  if (direct) {
    return direct;
  }
  const nested = asRecord(record.conversation);
  return asString(nested?._id) || asString(nested?.id);
};

export const htmlToPlainText = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const moduleTypeOf = (post: Record<string, unknown>) => {
  const moduleValue = post.module;
  if (typeof moduleValue === 'string' && moduleValue.trim()) {
    return moduleValue.trim().toLowerCase();
  }
  const nested = asRecord(moduleValue);
  const nestedType = asString(nested?.type);
  if (nestedType) {
    return nestedType.toLowerCase();
  }
  return asString(post.type).toLowerCase() || 'unknown';
};

export const mapConversationPost = (value: unknown): ConversationPost | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = asString(record._id) || asString(record.id) || asString(record.postId);
  const rawBody = asString(record.body);
  if (!id && !rawBody) {
    return null;
  }
  const moduleType = moduleTypeOf(record);
  const from = asRecord(record.from);
  const fromName =
    asString(from?.fullName) ||
    asString(record.from) ||
    asString(record.sentBy);
  return {
    id: id || crypto.randomUUID(),
    body: htmlToPlainText(rawBody),
    moduleType,
    sentBy: asString(record.sentBy) || asString(from?.type) || undefined,
    fromName: fromName || undefined,
    createdAt: asString(record.createdAt) || asString(record.sentAt),
    reservationId: asString(record.reservationId) || undefined,
    isNote: moduleType === 'note',
    isLog: moduleType === 'log',
  };
};

export const mapRelatedReservations = (
  conversation: Record<string, unknown> | null,
): RelatedReservation[] => {
  const meta = asRecord(conversation?.meta);
  const raw = Array.isArray(meta?.reservations)
    ? meta.reservations
    : Array.isArray(conversation?.reservations)
      ? conversation.reservations
      : [];
  const seen = new Set<string>();
  const related: RelatedReservation[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = asString(record?._id) || asString(record?.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    related.push({
      id,
      confirmationCode: asString(record?.confirmationCode) || undefined,
      status: asString(record?.status) || undefined,
    });
  }
  return related;
};

export const suggestedModuleTypeFor = (
  conversation: Record<string, unknown> | null,
) => {
  const integration =
    asRecord(conversation?.integration) ??
    asRecord(asRecord(conversation?.meta)?.integration);
  const platform = asString(integration?.platform).toLowerCase();
  if (platform.includes('airbnb')) {
    return 'airbnb2';
  }
  if (platform.includes('whatsapp')) {
    return 'whatsapp';
  }
  if (platform === 'sms') {
    return 'sms';
  }
  return 'email';
};

const unwrap = (payload: unknown): Record<string, unknown> | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  return asRecord(record.data) ?? record;
};

const requireClient = async () => {
  const client = await loadGuestyClient();
  if (!client) {
    throw new BookingConversationError(
      'GUESTY_UNAVAILABLE',
      'Guesty client is not available.',
    );
  }
  return client;
};

const loadBooking = async (bookingsTable: string, reservationId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      ProjectionExpression: 'ReservationID, ConversationID',
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

const persistConversationId = async (
  bookingsTable: string,
  reservationId: string,
  conversationId: string,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      ConditionExpression: 'attribute_exists(ReservationID)',
      UpdateExpression: 'SET ConversationID = :conversationId, UpdatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':conversationId': conversationId,
        ':updatedAt': nowIso(),
      },
    }),
  );
};

const conversationIdFromGuestyReservation = async (
  client: GuestyClient,
  reservationId: string,
) => {
  const reservation = await fetchGuestyReservation(client, reservationId);
  return extractConversationId(reservation);
};

export const resolveConversationForBooking = async (
  bookingsTable: string,
  reservationId: string,
  client?: GuestyClient,
) => {
  const id = reservationId.trim();
  if (!id) {
    throw new BookingConversationError(
      'INVALID_INPUT',
      'reservationId is required.',
    );
  }
  const guesty = client ?? (await requireClient());
  const booking = await loadBooking(bookingsTable, id);
  let conversationId = extractConversationId(booking);
  let repaired = false;

  const refreshFromReservation = async () => {
    const remoteId = await conversationIdFromGuestyReservation(guesty, id);
    if (!remoteId) {
      return '';
    }
    if (booking && remoteId !== conversationId) {
      try {
        await persistConversationId(bookingsTable, id, remoteId);
      } catch (error) {
        console.warn('Failed to persist ConversationID pointer', error);
      }
    }
    conversationId = remoteId;
    repaired = true;
    return remoteId;
  };

  if (!conversationId) {
    await refreshFromReservation();
  }

  if (!conversationId) {
    throw new BookingConversationError(
      booking ? 'CONVERSATION_NOT_FOUND' : 'BOOKING_NOT_FOUND',
      booking
        ? 'Guesty conversation was not found for this reservation.'
        : 'Booking was not found.',
    );
  }

  return {
    reservationId: id,
    conversationId,
    bookingExists: Boolean(booking),
    repaired,
    refreshFromReservation,
    client: guesty,
  };
};

const fetchConversation = async (client: GuestyClient, conversationId: string) => {
  const encoded = encodeURIComponent(conversationId);
  const payload = await client.guestyGet(
    `/v1/communication/conversations/${encoded}`,
  );
  return unwrap(payload);
};

const fetchPostsPage = async (
  client: GuestyClient,
  conversationId: string,
  cursorAfter?: string,
) => {
  const encoded = encodeURIComponent(conversationId);
  const params: Record<string, unknown> = { sort: '-createdAt' };
  if (cursorAfter) {
    params.cursorAfter = cursorAfter;
  }
  const payload = await client.guestyGet(
    `/v1/communication/conversations/${encoded}/posts`,
    params,
  );
  const data = unwrap(payload) ?? asRecord(payload) ?? {};
  const rawPosts = Array.isArray(data.posts)
    ? data.posts
    : Array.isArray(data.data)
      ? data.data
      : [];
  const cursor = asRecord(data.cursor);
  return {
    posts: rawPosts
      .map(mapConversationPost)
      .filter((post): post is ConversationPost => Boolean(post)),
    cursor: {
      after: asString(cursor?.after) || undefined,
      before: asString(cursor?.before) || undefined,
    },
  };
};

const toThread = ({
  reservationId,
  conversationId,
  conversation,
  posts,
  cursor,
}: {
  reservationId: string;
  conversationId: string;
  conversation: Record<string, unknown> | null;
  posts: ConversationPost[];
  cursor?: { after?: string; before?: string };
}): ConversationThread => {
  const relatedReservations = mapRelatedReservations(conversation);
  const relatedReservationIds = relatedReservations.map((item) => item.id);
  if (!relatedReservationIds.includes(reservationId)) {
    relatedReservationIds.unshift(reservationId);
  }
  const integration =
    asRecord(conversation?.integration) ??
    asRecord(asRecord(conversation?.meta)?.integration);
  return {
    reservationId,
    conversationId,
    relatedReservationIds,
    relatedReservations,
    fetchedAt: nowIso(),
    posts,
    cursor,
    integrationPlatform: asString(integration?.platform) || undefined,
    suggestedModuleType: suggestedModuleTypeFor(conversation),
  };
};

export const listConversationPosts = async (
  input: ListConversationPostsInput,
): Promise<ConversationThread> => {
  const resolved = await resolveConversationForBooking(
    input.bookingsTable,
    input.reservationId,
  );
  let conversation: Record<string, unknown> | null = null;
  try {
    conversation = await fetchConversation(
      resolved.client,
      resolved.conversationId,
    );
  } catch (error) {
    if (!isGuestyNotFound(error)) {
      throw error;
    }
    const refreshed = await resolved.refreshFromReservation();
    if (!refreshed || refreshed === resolved.conversationId) {
      throw new BookingConversationError(
        'CONVERSATION_NOT_FOUND',
        'Guesty conversation was not found for this reservation.',
      );
    }
    conversation = await fetchConversation(resolved.client, refreshed);
    resolved.conversationId = refreshed;
  }

  let page;
  try {
    page = await fetchPostsPage(
      resolved.client,
      resolved.conversationId,
      input.cursorAfter,
    );
  } catch (error) {
    if (!isGuestyNotFound(error)) {
      throw error;
    }
    const refreshed = await resolved.refreshFromReservation();
    if (!refreshed) {
      throw new BookingConversationError(
        'CONVERSATION_NOT_FOUND',
        'Guesty conversation posts were not found for this reservation.',
      );
    }
    page = await fetchPostsPage(resolved.client, refreshed, input.cursorAfter);
    resolved.conversationId = refreshed;
    conversation = await fetchConversation(resolved.client, refreshed).catch(
      () => conversation,
    );
  }

  const posts = input.includeLogs
    ? page.posts
    : page.posts.filter((post) => !post.isLog);
  return toThread({
    reservationId: resolved.reservationId,
    conversationId: resolved.conversationId,
    conversation,
    posts,
    cursor: page.cursor,
  });
};

export const sendConversationMessage = async (
  input: SendConversationMessageInput,
) => {
  const body = input.body.trim();
  if (!body) {
    throw new BookingConversationError('INVALID_INPUT', 'body is required.');
  }
  const resolved = await resolveConversationForBooking(
    input.bookingsTable,
    input.reservationId,
  );
  let conversation: Record<string, unknown> | null = null;
  try {
    conversation = await fetchConversation(
      resolved.client,
      resolved.conversationId,
    );
  } catch (error) {
    if (!isGuestyNotFound(error)) {
      throw error;
    }
    const refreshed = await resolved.refreshFromReservation();
    if (!refreshed) {
      throw new BookingConversationError(
        'CONVERSATION_NOT_FOUND',
        'Guesty conversation was not found for this reservation.',
      );
    }
    resolved.conversationId = refreshed;
    conversation = await fetchConversation(resolved.client, refreshed);
  }

  const deliver = input.deliver !== false;
  const moduleType = (
    input.moduleType?.trim() ||
    (deliver ? suggestedModuleTypeFor(conversation) : 'note')
  ).toLowerCase();
  const encoded = encodeURIComponent(resolved.conversationId);
  const payload = { module: { type: moduleType }, body };
  const path = deliver
    ? `/v1/communication/conversations/${encoded}/send-message`
    : `/v1/communication/conversations/${encoded}/posts`;
  const response = await resolved.client.guestyPost(path, payload);
  const posted =
    mapConversationPost(unwrap(response) ?? response) ??
    mapConversationPost(asRecord(asRecord(response)?.data)) ??
    {
      id: crypto.randomUUID(),
      body,
      moduleType,
      createdAt: nowIso(),
      isNote: moduleType === 'note',
      isLog: false,
    };
  const relatedReservationIds = mapRelatedReservations(conversation).map(
    (item) => item.id,
  );
  if (!relatedReservationIds.includes(resolved.reservationId)) {
    relatedReservationIds.unshift(resolved.reservationId);
  }
  return {
    post: posted,
    conversationId: resolved.conversationId,
    relatedReservationIds,
    delivered: deliver,
  };
};
