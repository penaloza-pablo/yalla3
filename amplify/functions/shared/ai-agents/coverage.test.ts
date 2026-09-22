import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCoveragePolicy,
  findingsFromCoverage,
} from './coverage';

test('mention coverage marks unnamed guests as unchecked', () => {
  const coverage = applyCoveragePolicy(
    { type: 'mention_in_output' },
    [
      {
        planned: [
          { id: '1', label: 'Ana Pérez' },
          { id: '2', label: 'Luis Soto' },
        ],
        unchecked: [
          { id: '3', label: 'res-3', reason: 'Booking has no guest name.' },
        ],
      },
    ],
    'Ana Pérez arrived at sunrise. Madrid opened a hidden door for her.',
  );
  assert.equal(coverage.reviewed.length, 1);
  assert.equal(coverage.reviewed[0]?.label, 'Ana Pérez');
  assert.equal(
    coverage.unchecked.some((item) => item.label === 'Luis Soto'),
    true,
  );
  assert.equal(
    coverage.unchecked.some((item) => item.reason === 'Booking has no guest name.'),
    true,
  );
});

test('findings warn when the story is not three paragraphs', () => {
  const coverage = applyCoveragePolicy(
    { type: 'mention_in_output' },
    [{ planned: [{ id: '1', label: 'Ana' }], unchecked: [] }],
    'Ana walked into Madrid and the city turned gold.',
  );
  const findings = findingsFromCoverage(coverage, 'Ana walked into Madrid and the city turned gold.', {
    type: 'mention_in_output',
    expectedParagraphs: 3,
  });
  assert.equal(
    findings.some((item) => item.title === 'Unexpected paragraph count'),
    true,
  );
});
