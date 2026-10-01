import { P2_ROOM_KEYS } from './cleaning-property-groups';

export type InvoicePropertyGroup = 'apartments' | 'p2';

export type InvoiceTypeKey =
  | 'studio'
  | 'studio_sofa'
  | 'one_bedroom'
  | 'one_bedroom_sofa'
  | 'two_bedroom'
  | 'room_regular'
  | 'room_refresh'
  | 'p2_deep'
  | 'p2_refresh'
  | 'refresh_bathrooms'
  | 'light_refresh'
  | 'refresh'
  | 'storage'
  | 'keynest'
  | 'travel'
  | 'extra_hours'
  | 'emergency';

export type InvoiceMappingTarget = {
  propertyKey: string;
  typeKey: InvoiceTypeKey;
};

export type InvoiceMappingRule = {
  group: InvoicePropertyGroup;
  folded: string;
  targets: InvoiceMappingTarget[];
};

export const INVOICE_ENTITIES: Record<
  InvoicePropertyGroup,
  { legalName: string; cif: string; displayName: string }
> = {
  apartments: {
    legalName: 'DILIGENTE RE MANAGEMENT SL',
    cif: 'B70671284',
    displayName: 'Apartamentos',
  },
  p2: {
    legalName: 'NADLAN ROSENFELD S',
    cif: 'B75731356',
    displayName: 'Planta 2',
  },
};

export const foldInvoiceText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const foldCompanyName = (value: string) => {
  const folded = foldInvoiceText(value).replace(/\bsl\b/g, 's').trim();
  return folded.replace(/\ss$/, ' s');
};

const TYPE_SYNONYMS: Record<InvoiceTypeKey, string[]> = {
  studio: ['studio', 'estudio'],
  studio_sofa: ['studio sofa', 'estudio sofa', 'sofa bed studio'],
  one_bedroom: ['1 bedroom', 'one bedroom', '1 habitacion'],
  one_bedroom_sofa: [
    '1 bedroom sofa',
    'one bedroom sofa',
    '1 habitacion sofa',
    'sofa bed',
  ],
  two_bedroom: ['2 bedroom', 'two bedroom', '2 habitaciones'],
  room_regular: ['room regular', 'regular'],
  room_refresh: ['room refresh'],
  p2_deep: ['p2 deep cleaning', 'deep cleaning'],
  p2_refresh: ['p2 refresh', 'refresh'],
  refresh_bathrooms: [
    'refresh bathrooms',
    'refresh + bathrooms',
    'refresh and bathrooms',
  ],
  light_refresh: ['light refresh'],
  refresh: ['refresh', 'repaso'],
  storage: ['storage', 'trastero', 'wk assembling', 'storage and wk assembling'],
  keynest: ['keynest'],
  travel: ['desplazamiento', 'travel', 'displacement'],
  extra_hours: ['hora extra', 'horas extras', 'extra hour', 'extra hours'],
  emergency: ['emergencia', 'emergency'],
};

const PROPERTY_ALIASES: Record<string, string[]> = {
  'concepcion arenal': [
    'concepcion arenal',
    'arenal verdejo',
    'arenal jerez',
    'arenal rioja',
  ],
  platano: ['platano', 'platano 7', 'platano 7a', 'platano 7b', 'platano b'],
};

const APARTMENT_REGULAR_TYPES = new Set<InvoiceTypeKey>([
  'studio',
  'one_bedroom',
  'two_bedroom',
  'room_regular',
]);

const p2Room = (room: string, typeKey: InvoiceTypeKey): InvoiceMappingTarget => ({
  propertyKey: room,
  typeKey,
});

const p2Rooms = (
  rooms: string[],
  typeKey: InvoiceTypeKey,
): InvoiceMappingTarget[] => rooms.map((room) => p2Room(room, typeKey));

const P2_EXACT: InvoiceMappingRule[] = [
  ...P2_ROOM_KEYS.map((room) => ({
    group: 'p2' as const,
    folded: foldInvoiceText(`Salida habitación ${room}`),
    targets: p2Rooms([room], 'room_regular'),
  })),
  {
    group: 'p2',
    folded: foldInvoiceText('Salida habitación 211 y 212'),
    targets: p2Rooms(['211', '212'], 'room_regular'),
  },
  ...P2_ROOM_KEYS.map((room) => ({
    group: 'p2' as const,
    folded: foldInvoiceText(`Repaso habitación ${room}`),
    targets: p2Rooms([room], 'room_refresh'),
  })),
  {
    group: 'p2',
    folded: foldInvoiceText('Repaso habitación 202, 206 y 210'),
    targets: p2Rooms(['202', '206', '210'], 'room_refresh'),
  },
  {
    group: 'p2',
    folded: foldInvoiceText('limpieza profunda zona comun P2'),
    targets: [{ propertyKey: 'p2', typeKey: 'p2_deep' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('Repasos general P2'),
    targets: [{ propertyKey: 'p2', typeKey: 'p2_refresh' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('repasos con baño profundo'),
    targets: [{ propertyKey: 'p2', typeKey: 'refresh_bathrooms' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('repasos ligero'),
    targets: [{ propertyKey: 'p2', typeKey: 'light_refresh' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('zona comun'),
    targets: [{ propertyKey: 'p2', typeKey: 'p2_deep' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('Repasos general'),
    targets: [{ propertyKey: 'p2', typeKey: 'p2_refresh' }],
  },
  {
    group: 'p2',
    folded: foldInvoiceText('Repaso ligero'),
    targets: [{ propertyKey: 'p2', typeKey: 'light_refresh' }],
  },
];

const APARTMENT_EXACT: InvoiceMappingRule[] = [
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio sofa cama concepcion arenal'),
    targets: [{ propertyKey: 'concepcion arenal', typeKey: 'studio_sofa' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio concepcion arenal'),
    targets: [{ propertyKey: 'concepcion arenal', typeKey: 'studio' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio sofa cama esperanza 9'),
    targets: [{ propertyKey: 'esperanza 9', typeKey: 'studio_sofa' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio esperanza 9'),
    targets: [{ propertyKey: 'esperanza 9', typeKey: 'studio' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio sofa cama rodas'),
    targets: [{ propertyKey: 'rodas', typeKey: 'studio_sofa' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza estudio rodas'),
    targets: [{ propertyKey: 'rodas', typeKey: 'studio' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza 1 habitacion Mendizabal'),
    targets: [{ propertyKey: 'mendizabal', typeKey: 'one_bedroom' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpiezas 1 habitacion sofa cama'),
    targets: [{ propertyKey: '*', typeKey: 'one_bedroom_sofa' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpiezas 1 habitacion'),
    targets: [{ propertyKey: '*', typeKey: 'one_bedroom' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpiezas 2 habitaciones'),
    targets: [{ propertyKey: '*', typeKey: 'two_bedroom' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Desplazamiento Keynest'),
    targets: [{ propertyKey: '*', typeKey: 'keynest' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Limpieza Trastero'),
    targets: [{ propertyKey: '*', typeKey: 'storage' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Trastero'),
    targets: [{ propertyKey: '*', typeKey: 'storage' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Intervencion emergencia'),
    targets: [{ propertyKey: 'platano', typeKey: 'emergency' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Repaso'),
    targets: [{ propertyKey: '*', typeKey: 'refresh' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Desplazamiento'),
    targets: [{ propertyKey: '*', typeKey: 'travel' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Intervencion de emergencia Platano B'),
    targets: [{ propertyKey: 'platano', typeKey: 'emergency' }],
  },
  {
    group: 'apartments',
    folded: foldInvoiceText('Hora extras'),
    targets: [{ propertyKey: '*', typeKey: 'extra_hours' }],
  },
];

export const INVOICE_MAPPING_RULES: InvoiceMappingRule[] = [
  ...P2_EXACT,
  ...APARTMENT_EXACT,
];

const ROOM_NUMBER_RE = /\b(20[1-9]|21[0-2])\b/g;

export const extractP2RoomNumbers = (description: string) => {
  const rooms = new Set<string>();
  const folded = foldInvoiceText(description);
  for (const match of folded.matchAll(ROOM_NUMBER_RE)) {
    rooms.add(match[1]);
  }
  return [...rooms];
};

const longestFirst = (left: InvoiceMappingRule, right: InvoiceMappingRule) =>
  right.folded.length - left.folded.length;

export const mapInvoiceDescription = (
  description: string,
  group: InvoicePropertyGroup,
): InvoiceMappingTarget[] => {
  const folded = foldInvoiceText(description);
  if (!folded) {
    return [];
  }
  const rules = INVOICE_MAPPING_RULES.filter((rule) => rule.group === group).sort(
    longestFirst,
  );
  const exact = rules.find((rule) => folded === rule.folded);
  if (exact) {
    return exact.targets;
  }
  if (group === 'p2') {
    const rooms = extractP2RoomNumbers(description);
    if (rooms.length > 0 && folded.includes('salida')) {
      return p2Rooms(rooms, 'room_regular');
    }
    if (rooms.length > 0 && folded.includes('repaso')) {
      return p2Rooms(rooms, 'room_refresh');
    }
  }
  const included = rules.find((rule) => folded.includes(rule.folded));
  return included?.targets ?? [];
};

const includesAny = (folded: string, needles: string[]) =>
  needles.some((needle) => folded.includes(foldInvoiceText(needle)));

export const yallaTypeMatches = (cleaningTypeName: string, typeKey: InvoiceTypeKey) => {
  const folded = foldInvoiceText(cleaningTypeName);
  if (!folded) {
    return false;
  }
  const hasSofa = includesAny(folded, ['sofa', 'sofa cama', 'sofa bed']);
  const isPlainRegular = folded === 'regular' || folded === 'room regular';
  const isPlainRefresh = folded === 'refresh' || folded === 'p2 refresh';
  if (APARTMENT_REGULAR_TYPES.has(typeKey)) {
    if (hasSofa) {
      return false;
    }
    if (isPlainRegular) {
      return true;
    }
  }
  if (
    (typeKey === 'p2_refresh' || typeKey === 'refresh') &&
    isPlainRefresh &&
    !folded.includes('room refresh') &&
    !folded.includes('light') &&
    !folded.includes('bath')
  ) {
    return true;
  }
  if (includesAny(folded, TYPE_SYNONYMS[typeKey])) {
    if (typeKey === 'studio' && hasSofa) {
      return false;
    }
    if (typeKey === 'one_bedroom' && hasSofa) {
      return false;
    }
    if (typeKey === 'refresh' && includesAny(folded, ['p2 refresh', 'room refresh'])) {
      return false;
    }
    if (typeKey === 'p2_refresh' && includesAny(folded, ['room refresh', 'light', 'bath'])) {
      return false;
    }
    if (typeKey === 'travel' && includesAny(folded, ['keynest'])) {
      return false;
    }
    return true;
  }
  return false;
};

export const yallaPropertyMatches = (
  propertyLabel: string,
  propertyId: string,
  propertyKey: string,
) => {
  if (propertyKey === '*') {
    return true;
  }
  const foldedLabel = foldInvoiceText(propertyLabel);
  const foldedId = foldInvoiceText(propertyId);
  const foldedKey = foldInvoiceText(propertyKey);
  const aliases = [
    foldedKey,
    ...(PROPERTY_ALIASES[foldedKey] ?? []).map((entry) => foldInvoiceText(entry)),
  ];
  if (aliases.some((alias) => foldedLabel === alias || foldedId === alias)) {
    return true;
  }
  if (foldedKey === 'p2') {
    return (
      foldedLabel === 'p2' ||
      foldedLabel === 'planta 2' ||
      foldedLabel === 'planta2' ||
      foldedId === 'planta2' ||
      foldedId === 'p2'
    );
  }
  if (P2_ROOM_KEYS.includes(foldedKey as (typeof P2_ROOM_KEYS)[number])) {
    return (
      foldedLabel === foldedKey ||
      foldedLabel.endsWith(` ${foldedKey}`) ||
      foldedId === foldedKey
    );
  }
  return aliases.some(
    (alias) =>
      alias.length >= 4 &&
      (foldedLabel.startsWith(`${alias} `) ||
        foldedLabel.endsWith(` ${alias}`) ||
        foldedId === alias),
  );
};

export const moneyEquals = (left: number, right: number, epsilon = 0.02) =>
  Math.abs(left - right) <= epsilon;
