import { DEFAULT_OPENAI_MODEL } from './models';
import { DEFAULT_RUNTIME_LIMITS } from './limits';
import type { AgentDefinition } from './types';

export const AI_AGENTS_CATALOG_VERSION = 2;

const MADRID_ARRIVAL_STORY_ID = 'madrid-arrival-story';
const TODAY_ARRIVALS_BRIEF_ID = 'today-arrivals-brief';

const sharedSchedule = {
  kind: 'manual' as const,
  description: 'On demand from Agent Studio.',
};

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
    schedule: sharedSchedule,
    coveragePolicy: { type: 'mention_in_output', expectedParagraphs: 3 },
    enabled: true,
    catalogVersion: AI_AGENTS_CATALOG_VERSION,
    status: 'published',
    draftVersion: 1,
    publishedVersion: 1,
    runtimeLimits: DEFAULT_RUNTIME_LIMITS,
    memoryPolicy: { kind: 'none' },
    permissionPolicy: { allowedTools: ['list_today_checkin_guests'] },
    approvalPolicy: { requireApprovalFor: [] },
    knowledgeSources: [],
  },
  {
    id: TODAY_ARRIVALS_BRIEF_ID,
    name: 'Today arrivals brief',
    purpose:
      'Operational briefing. Lists how many guests check in today in Madrid and names each one in a short Spanish note.',
    instructions: `You are an operational Yalla agent.

Process:
1. Call list_today_checkin_guests exactly once.
2. Count the guests in the guests array.
3. Reply in Spanish with two short paragraphs: the count, then the names separated by commas.
4. Do not invent names. Do not write a story. Do not mention reservation ids.`,
    rules: [
      'Use only list_today_checkin_guests.',
      'If there are no guests, say so in one Spanish sentence.',
      'Keep the briefing under 120 words.',
    ],
    allowedTools: ['list_today_checkin_guests'],
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    schedule: sharedSchedule,
    coveragePolicy: { type: 'tool_declared' },
    enabled: true,
    catalogVersion: AI_AGENTS_CATALOG_VERSION,
    status: 'published',
    draftVersion: 1,
    publishedVersion: 1,
    runtimeLimits: DEFAULT_RUNTIME_LIMITS,
    memoryPolicy: { kind: 'none' },
    permissionPolicy: { allowedTools: ['list_today_checkin_guests'] },
    approvalPolicy: { requireApprovalFor: [] },
    knowledgeSources: [],
  },
];

export const getCatalogAgent = (id: string) =>
  AGENT_CATALOG.find((agent) => agent.id === id);

export const MADRID_ARRIVAL_STORY_AGENT_ID = MADRID_ARRIVAL_STORY_ID;
export const TODAY_ARRIVALS_BRIEF_AGENT_ID = TODAY_ARRIVALS_BRIEF_ID;
