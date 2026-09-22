import type { AgentDefinition } from './types';

export const AI_AGENTS_CATALOG_VERSION = 1;

const MADRID_ARRIVAL_STORY_ID = 'madrid-arrival-story';

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    id: MADRID_ARRIVAL_STORY_ID,
    name: 'Madrid arrival story',
    purpose:
      'Validation agent. Reads the names of guests checking in today and writes a single three-paragraph fantastical story about their arrival day in Madrid, naming each guest at least once.',
    instructions: `You are an operational Yalla agent, not a coding assistant.

Your only job is to write one original fantastical story about the guests arriving in Madrid today.

Process:
1. Call list_today_checkin_guests exactly once.
2. Collect every guest name returned in the guests array.
3. Write exactly three paragraphs in Spanish.
4. Name each guest at least once. Use the names exactly as provided.
5. The story must be a single shared day in Madrid: arrival, a fantastical event in the city, and how the guests close the day.
6. Do not mention reservations, property nicknames, confirmation codes, emails, or internal Yalla data.
7. Do not add a title, bullet list, or extra commentary. Return only the three paragraphs.`,
    rules: [
      'Use only list_today_checkin_guests. Do not invent guests.',
      'If the tool returns no guests, say so in one short Spanish sentence and stop.',
      'If a booking has no guest name, skip it. Do not invent a name.',
      'Write exactly three paragraphs and mention every named guest at least once.',
      'This agent is a runtime validation exercise, not a guest-facing product.',
    ],
    allowedTools: ['list_today_checkin_guests'],
    provider: 'openai',
    model: 'gpt-4o-mini',
    schedule: {
      kind: 'manual',
      description: 'On demand from the Agents section.',
    },
    coveragePolicy: { type: 'mention_in_output' },
    enabled: true,
    catalogVersion: AI_AGENTS_CATALOG_VERSION,
  },
];

export const getCatalogAgent = (id: string) =>
  AGENT_CATALOG.find((agent) => agent.id === id);

export const MADRID_ARRIVAL_STORY_AGENT_ID = MADRID_ARRIVAL_STORY_ID;
