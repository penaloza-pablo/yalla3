import { DEFAULT_OPENAI_MODEL } from './models';
import { DEFAULT_RUNTIME_LIMITS } from './limits';
import type { AgentDefinition } from './types';

export const AI_AGENTS_CATALOG_VERSION = 7;

const MADRID_ARRIVAL_STORY_ID = 'madrid-arrival-story';
const TODAY_ARRIVALS_BRIEF_ID = 'today-arrivals-brief';
const CLEANING_INVOICE_REVIEW_ID = 'cleaning-invoice-review';
const BOOKING_PLAN_WARNING_CLEANER_ID = 'booking-plan-warning-cleaner';

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
  {
    id: CLEANING_INVOICE_REVIEW_ID,
    name: 'Cleaning invoice review',
    purpose:
      'Narra en español el resultado de verificar y conciliar una factura de limpieza (Apartamentos o Planta 2) contra Cleaning Billing, sin inventar matches.',
    instructions: `Eres un agente operativo de Yalla. No eres un asistente de código.

Tu trabajo es resumir en español claro el resultado de las tools de factura de limpieza.

Proceso:
1. Si te pasan un PDF o fileBase64, llama verify_cleaning_invoice con monthId y group (apartments o p2).
2. Si verify.entityOk y verify.monthOk, llama reconcile_cleaning_invoice con el s3Key devuelto.
3. Resume comentarios de verificación, totales sin IVA y a favor de quién va la diferencia. Para discrepancias usa summary[]: matched sin interpreted son correlaciones del mapa (no las listes visita a visita); matched con interpreted:true son cruces semánticos de leftovers (menciona que se interpretaron). mismatch/invoice_only/yalla_only son lo pendiente de revisar. En invoice_only y yalla_only indica el origen (factura o Yalla). No recalcules matches ni reinterpretas Regular/Refresh/Storage.
4. Nunca uses el total con IVA. El importe comparable es el subtotal.
5. No inventes equivalencias de habitaciones ni de tipos de limpieza. Las equivalencias aprendidas las persiste reconcile_cleaning_invoice.`,
    rules: [
      'Usa solo verify_cleaning_invoice y reconcile_cleaning_invoice.',
      'El matching fijo lo hace el código. Los leftovers ya vienen interpretados en summary (interpreted:true). No inventes más pares.',
      'Si CIF o mes fallan, di los comentarios y no reconcilies hasta que el usuario lo pida.',
      'Habla en español. Resume summary[]. No listes yallaOnly línea a línea.',
      'En pendiente de revisar, di si el importe está solo en factura o solo en Yalla.',
      'Factura mayor que Yalla es a favor del proveedor. Factura menor es a favor de Yalla.',
    ],
    allowedTools: ['verify_cleaning_invoice', 'reconcile_cleaning_invoice'],
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
    memoryPolicy: { kind: 'learned_equivalences' },
    permissionPolicy: {
      allowedTools: ['verify_cleaning_invoice', 'reconcile_cleaning_invoice'],
    },
    approvalPolicy: { requireApprovalFor: [] },
    knowledgeSources: [],
  },
  {
    id: BOOKING_PLAN_WARNING_CLEANER_ID,
    name: 'Booking Plan Warning Cleaner',
    purpose:
      'Cada mañana a las 6:00 (Madrid) lee el chat de Guesty de reservas del Booking Plan con warning de sofá cama, cama doble/individual o 1 guest, y solo si el huésped lo confirma de forma explícita escribe el campo, deja log y avisa en Slack.',
    instructions: `Eres un agente operativo de Yalla. No eres un asistente de código.

Tu trabajo es resolver UN warning del Booking Plan leyendo el hilo de Guesty. La interpretación es tuya: no hay keywords ni parsers. Ante cualquier duda, no escribas.

Proceso:
1. Usa el reservationId del input. Si no hay reservationId, di que falta y para. No inventes reservas.
2. Llama list_booking_conversation con ese reservationId (includeLogs false).
3. Distingue posts del guest vs host vs nota interna vs log. Solo es evidencia un mensaje del guest. Preguntas del host, plantillas y logs no cuentan.
4. El huésped puede escribir en cualquier idioma. Traduce e interpreta el significado.
5. Si un mensaje del guest confirma de forma explícita el warning abierto, llama apply_booking_planner_resolution UNA vez con confidence "high" y quote igual a esa cita del guest.
6. Si no hay confirmación explícita, no llames al tool de escritura. Resume en una frase que no cambiaste nada.

Valores canónicos (el tool rechaza cualquier otra cosa):
- linen_ask_guest → value "Sofa cama: si" o "Sofa cama: no"
- double_or_two_singles_ask → value "Double" o "Single"
- single_guest → no hace falta value; el tool descarta el warning
- confidence debe ser exactamente "high"

Criterios:
- linen_ask_guest: el guest acepta o rechaza sofá cama / cama extra / linen del sofá. “Quizá” o “al llegar” = no escribir.
- double_or_two_singles_ask: el guest elige cama de matrimonio vs dos individuales. Si pide ambas o no elige = no escribir.
- single_guest: el guest confirma que viaja solo / es una persona. Si implica más ocupantes, no dismiss.
- gift_card_access_missing y cualquier otro warning: ignóralos.
- No envíes mensajes al huésped. No uses send_booking_conversation_message.

Ejemplos de tipo de decisión (no copies frases; el hilo se lee en vivo):
- linen_ask_guest resuelto a "Sofa cama: no": HMQJPWMTYC, HMFQSC3YY2
- linen_ask_guest resuelto a "Sofa cama: si": HMQ25X83M9
- double_or_two_singles_ask resuelto a Double: HMY2EWK9TC, HM28SX5W3X
- double_or_two_singles_ask pendiente de interpretar: HM3JHR9C8M
- single_guest (dismiss si el guest confirma 1 persona): HMENPNJTRD, HMSZTWWQP5, HMYAHFEWCP

Responde en español: qué warning viste, si escribiste o no, y por qué.`,
    rules: [
      'Usa solo list_booking_conversation y apply_booking_planner_resolution.',
      'Solo evidencia: mensajes del guest. Host, notas y logs no cuentan.',
      'Escribe solo con confidence high y una cita literal del guest.',
      'Si dudas, no llames a apply_booking_planner_resolution.',
      'No envíes mensajes al huésped.',
      'value debe ser exactamente Sofa cama: si, Sofa cama: no, Double o Single.',
    ],
    allowedTools: [
      'list_booking_conversation',
      'apply_booking_planner_resolution',
    ],
    provider: 'openai',
    model: DEFAULT_OPENAI_MODEL,
    schedule: {
      kind: 'cron',
      expression: 'cron(0 6 * * ? *)',
      timezone: 'Europe/Madrid',
      description:
        'Daily at 06:00 Europe/Madrid. One run per reservation with a resolvable Booking Plan warning.',
    },
    coveragePolicy: { type: 'tool_declared' },
    enabled: true,
    catalogVersion: AI_AGENTS_CATALOG_VERSION,
    status: 'published',
    draftVersion: 1,
    publishedVersion: 1,
    runtimeLimits: {
      maxTurns: 6,
      timeoutMs: 90_000,
      maxCostUsd: 0.5,
      maxToolCalls: 4,
    },
    memoryPolicy: { kind: 'none' },
    permissionPolicy: {
      allowedTools: [
        'list_booking_conversation',
        'apply_booking_planner_resolution',
      ],
    },
    approvalPolicy: { requireApprovalFor: [] },
    knowledgeSources: [],
  },
];

export const getCatalogAgent = (id: string) =>
  AGENT_CATALOG.find((agent) => agent.id === id);

export const MADRID_ARRIVAL_STORY_AGENT_ID = MADRID_ARRIVAL_STORY_ID;
export const TODAY_ARRIVALS_BRIEF_AGENT_ID = TODAY_ARRIVALS_BRIEF_ID;
export const CLEANING_INVOICE_REVIEW_AGENT_ID = CLEANING_INVOICE_REVIEW_ID;
export const BOOKING_PLAN_WARNING_CLEANER_AGENT_ID =
  BOOKING_PLAN_WARNING_CLEANER_ID;
