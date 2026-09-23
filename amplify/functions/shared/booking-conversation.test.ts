import assert from 'node:assert/strict';
import test from 'node:test';
import { isGuestyNotFound } from './guesty-client';
import {
  extractConversationId,
  htmlToPlainText,
  mapConversationPost,
  mapRelatedReservations,
  suggestedModuleTypeFor,
} from './booking-conversation';

test('extractConversationId reads booking pointer and nested reservation shapes', () => {
  assert.equal(
    extractConversationId({ ConversationID: 'conv-booking' }),
    'conv-booking',
  );
  assert.equal(
    extractConversationId({ conversationId: 'conv-guesty' }),
    'conv-guesty',
  );
  assert.equal(
    extractConversationId({ conversation: { _id: 'conv-nested' } }),
    'conv-nested',
  );
  assert.equal(extractConversationId({ guest: { name: 'Ada' } }), '');
});

test('htmlToPlainText strips email markup', () => {
  assert.equal(
    htmlToPlainText('<p>Hola <strong>Ada</strong></p><br/>Nos vemos'),
    'Hola Ada\nNos vemos',
  );
});

test('mapConversationPost normalizes notes, logs, and channel messages', () => {
  const note = mapConversationPost({
    _id: 'p1',
    body: 'Internal note',
    module: { type: 'note' },
    from: { type: 'user', fullName: 'Ops' },
    createdAt: '2026-09-23T08:00:00.000Z',
  });
  assert.equal(note?.isNote, true);
  assert.equal(note?.isLog, false);
  assert.equal(note?.fromName, 'Ops');

  const log = mapConversationPost({
    _id: 'p2',
    body: 'Reservation confirmed',
    module: { type: 'log' },
    sentBy: 'log',
    createdAt: '2026-09-23T07:00:00.000Z',
  });
  assert.equal(log?.isLog, true);

  const email = mapConversationPost({
    postId: 'p3',
    body: '<p>See you at 14:00</p>',
    module: 'email',
    type: 'fromGuest',
    createdAt: '2026-09-23T09:00:00.000Z',
    reservationId: 'res-1',
  });
  assert.equal(email?.moduleType, 'email');
  assert.equal(email?.body, 'See you at 14:00');
  assert.equal(email?.reservationId, 'res-1');
});

test('mapRelatedReservations exposes the N:1 conversation scope', () => {
  const related = mapRelatedReservations({
    meta: {
      reservations: [
        { _id: 'res-a', confirmationCode: 'AAA', status: 'confirmed' },
        { _id: 'res-b', confirmationCode: 'BBB', status: 'confirmed' },
        { _id: 'res-a', confirmationCode: 'DUP' },
      ],
    },
  });
  assert.deepEqual(
    related.map((item) => item.id),
    ['res-a', 'res-b'],
  );
  assert.equal(related[0]?.confirmationCode, 'AAA');
});

test('suggestedModuleTypeFor follows Guesty channel, not booking fields', () => {
  assert.equal(
    suggestedModuleTypeFor({
      integration: { platform: 'airbnb2' },
    }),
    'airbnb2',
  );
  assert.equal(
    suggestedModuleTypeFor({
      meta: { integration: { platform: 'manual' } },
    }),
    'email',
  );
});

test('isGuestyNotFound detects 404 shapes', () => {
  assert.equal(isGuestyNotFound({ status: 404 }), true);
  assert.equal(isGuestyNotFound(new Error('Posts not found')), true);
  assert.equal(isGuestyNotFound({ status: 500, message: 'boom' }), false);
});
