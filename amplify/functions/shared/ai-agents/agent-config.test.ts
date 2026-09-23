import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAgentUpsert, slugifyAgentId } from './agent-config';

test('slugifyAgentId strips accents and punctuation', () => {
  assert.equal(slugifyAgentId('Madrid arrival story'), 'madrid-arrival-story');
  assert.equal(slugifyAgentId('  Revisión 1  '), 'revision-1');
});

test('normalizeAgentUpsert rejects unknown tools and empty names', () => {
  const tools = new Set(['list_today_checkin_guests']);
  const unnamed = normalizeAgentUpsert(
    { name: '  ' },
    { registeredToolNames: tools, allocateId: () => 'x' },
  );
  assert.equal(unnamed.ok, false);

  const unknown = normalizeAgentUpsert(
    { name: 'Check guests', allowedTools: ['invented_tool'] },
    { registeredToolNames: tools, allocateId: () => 'check-guests' },
  );
  assert.equal(unknown.ok, false);
});

test('normalizeAgentUpsert keeps allowed tools, rules, and model', () => {
  const result = normalizeAgentUpsert(
    {
      name: 'Check guests',
      purpose: 'List today arrivals.',
      instructions: 'Call the tool once.',
      rules: ['Do not invent guests.', '  ', 'Write in Spanish.'],
      allowedTools: ['list_today_checkin_guests'],
      model: 'gpt-4o',
      enabled: true,
      coveragePolicy: { type: 'mention_in_output', expectedParagraphs: 3 },
    },
    {
      registeredToolNames: new Set(['list_today_checkin_guests']),
      allocateId: (name) => name,
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.agent.model, 'gpt-4o');
  assert.deepEqual(result.agent.allowedTools, ['list_today_checkin_guests']);
  assert.deepEqual(result.agent.rules, [
    'Do not invent guests.',
    'Write in Spanish.',
  ]);
  assert.equal(result.agent.coveragePolicy.type, 'mention_in_output');
  assert.equal(result.agent.coveragePolicy.expectedParagraphs, 3);
  assert.equal(result.agent.provider, 'openai');
  assert.equal(result.agent.status, 'draft');
  assert.equal(result.agent.draftVersion, 1);
  assert.equal(result.agent.publishedVersion, undefined);
});
