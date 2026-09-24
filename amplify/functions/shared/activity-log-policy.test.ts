import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITY_LOG_VISIBLE_FROM,
  isVisitTaskActivitySummary,
  logMatchesProperty,
  logMatchesUsers,
  propertyMatchLabels,
  textMentionsProperty,
} from './activity-log-policy';

test('hides logs before 24 Sep 2026 Europe/Madrid', () => {
  assert.equal(ACTIVITY_LOG_VISIBLE_FROM, '2026-09-23T22:00:00.000Z');
  assert.ok('2026-09-23T21:59:59.000Z' < ACTIVITY_LOG_VISIBLE_FROM);
  assert.ok('2026-09-24T10:10:00.000Z' > ACTIVITY_LOG_VISIBLE_FROM);
});

test('detects visit task activity summaries', () => {
  assert.equal(
    isVisitTaskActivitySummary(
      'marked task "Water flows properly through the shower holes" as completed',
    ),
    true,
  );
  assert.equal(isVisitTaskActivitySummary('updated task "Change linens"'), true);
  assert.equal(isVisitTaskActivitySummary('created task "Inspect boiler"'), true);
  assert.equal(isVisitTaskActivitySummary('deleted task "Inspect boiler"'), true);
  assert.equal(
    isVisitTaskActivitySummary(
      'created inbox copy "Inspect boiler" from skipped task "task-1"',
    ),
    true,
  );
  assert.equal(
    isVisitTaskActivitySummary('marked visit "Clean Mesón de Paredes" as completed'),
    false,
  );
  assert.equal(
    isVisitTaskActivitySummary('added task "Call guest" to case "Leak"'),
    false,
  );
});

test('matches a property by id or by name inside the summary', () => {
  assert.deepEqual(
    propertyMatchLabels(['Sol', 'Mesón de Paredes', '  ', 'P2']),
    ['Mesón de Paredes'],
  );
  assert.equal(
    textMentionsProperty(
      'marked visit "Clean Mesón de Paredes" as completed',
      'Mesón de Paredes',
    ),
    true,
  );
  assert.equal(
    textMentionsProperty('resolved the sofa question', 'Sol'),
    false,
  );
  assert.equal(
    logMatchesProperty(
      {
        summary: 'marked visit "Clean Mesón de Paredes" as completed',
        entityName: 'Clean Mesón de Paredes',
      },
      ['prop-1'],
      ['Mesón de Paredes'],
    ),
    true,
  );
  assert.equal(
    logMatchesProperty(
      { propertyId: 'prop-1', summary: 'updated visit "Morning check"' },
      ['prop-1'],
      ['Mesón de Paredes'],
    ),
    true,
  );
  assert.equal(
    logMatchesProperty(
      { summary: 'triggered a bookings sync from Guesty' },
      ['prop-1'],
      ['Mesón de Paredes'],
    ),
    false,
  );
});

test('matches log users without case sensitivity', () => {
  assert.equal(
    logMatchesUsers('Solmaira.N@joseolimpiezas.com', [
      'solmaira.n@joseolimpiezas.com',
    ]),
    true,
  );
  assert.equal(logMatchesUsers('other@yalla.test', ['solmaira.n@joseolimpiezas.com']), false);
  assert.equal(logMatchesUsers('anyone@yalla.test', []), true);
});
