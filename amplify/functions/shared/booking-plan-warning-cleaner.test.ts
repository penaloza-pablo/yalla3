import assert from 'node:assert/strict';
import test from 'node:test';
import { LINEN_VALUES } from './bookings-planner';
import {
  buildWarningCleanerInput,
  parsePlannerResolutionArgs,
} from './booking-plan-warning-cleaner';

test('parsePlannerResolutionArgs rejects anything other than confidence high', () => {
  const parsed = parsePlannerResolutionArgs({
    reservationId: 'res-1',
    warningCode: 'linen_ask_guest',
    value: LINEN_VALUES.NO,
    quote: 'No necesitamos el sofá cama',
    confidence: 'medium',
  });
  assert.equal(parsed.ok, false);
});

test('parsePlannerResolutionArgs accepts sofa bed yes or no', () => {
  const parsed = parsePlannerResolutionArgs({
    reservationId: 'res-1',
    warningCode: 'linen_ask_guest',
    value: LINEN_VALUES.YES,
    quote: 'We will need the sofa bed',
    confidence: 'high',
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.linen, LINEN_VALUES.YES);
  assert.equal(parsed.dismissWarning, undefined);
});

test('parsePlannerResolutionArgs rejects n/a for linen_ask_guest', () => {
  const parsed = parsePlannerResolutionArgs({
    reservationId: 'res-1',
    warningCode: 'linen_ask_guest',
    value: LINEN_VALUES.NA,
    quote: 'No sofa',
    confidence: 'high',
  });
  assert.equal(parsed.ok, false);
});

test('parsePlannerResolutionArgs accepts Verdejo Double or Single', () => {
  const parsed = parsePlannerResolutionArgs({
    reservationId: 'res-2',
    warningCode: 'double_or_two_singles_ask',
    value: LINEN_VALUES.DOUBLE,
    quote: 'Please prepare a double bed',
    confidence: 'high',
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.linen, LINEN_VALUES.DOUBLE);
});

test('parsePlannerResolutionArgs dismisses single_guest without a linen value', () => {
  const parsed = parsePlannerResolutionArgs({
    reservationId: 'res-3',
    warningCode: 'single_guest',
    quote: 'I am traveling alone',
    confidence: 'high',
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.dismissWarning, 'single_guest');
  assert.equal(parsed.linen, undefined);
});

test('buildWarningCleanerInput includes reservationId and warning codes', () => {
  const input = buildWarningCleanerInput({
    reservationId: 'abc',
    confirmationCode: 'HMQJPWMTYC',
    guestName: 'Ana',
    property: 'Esperanza 14',
    alerts: [
      {
        code: 'linen_ask_guest',
        warning: 'Consulta al huésped lo del sofá cama.',
        value: '?',
      },
    ],
  });
  assert.match(input, /reservationId: abc/);
  assert.match(input, /HMQJPWMTYC/);
  assert.match(input, /linen_ask_guest/);
});
