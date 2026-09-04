import { isSpanishLocale } from '../i18n/display'

/** Fallback Spanish titles for the shared DEEP PC checklist (English title -> ES). */
export const TEMPLATE_TASK_TITLE_ES: Record<string, string> = {
  Unclogging: 'Desatascar',
  'A/C Maintenance': 'Mantenimiento de A/A',
  'Building access': 'Acceso al edificio',
  'Apartment door': 'Puerta del apartamento',
  'Guest key set': 'Juego de llaves de huésped',
  'Wifi & Internet': 'Wifi e internet',
  'A/C / heating': 'A/A / calefacción',
  'Hairdryer, iron, and ironing board': 'Secador, plancha y tabla de planchar',
  Vacuum: 'Aspiradora',
  'Water leaks': 'Fugas de agua',
  'Smoke detector': 'Detector de humo',
  'Artwork and decor': 'Cuadros y decoración',
  'Windows and blinds': 'Ventanas y persianas',
  'Lamps and lightbulbs': 'Lámparas y bombillas',
  'Mirrors and windows': 'Espejos y ventanas',
  'Furniture, shelves, and wardrobe drawers':
    'Muebles, estantes y cajones del armario',
  'Shower head': 'Alcachofa de ducha',
  'Hot water': 'Agua caliente',
  'Bathroom silicone': 'Silicona del baño',
  'Valve operation': 'Funcionamiento de válvulas',
  'Test remotes': 'Probar mandos',
  Netflix: 'Netflix',
  'Blankets and cushions': 'Mantas y cojines',
  'Kettle, toaster and coffee machine': 'Hervidor, tostadora y cafetera',
  'Fridge light, drawers, and shelves': 'Luz, cajones y estantes del frigorífico',
  Freezer: 'Congelador',
  'Bed structure': 'Estructura de la cama',
  Degreaser: 'Desengrasante',
  'Stain remover': 'Quitamanchas',
  'Floor cleaner': 'Limpiasuelos',
  'Dish soap': 'Jabón de platos',
  'Air freshener spray': 'Ambientador en spray',
  'Wall freshener refills': 'Recambios de ambientador de pared',
  'Drain cleaner': 'Limpiatuberías',
  'Spare remote batteries': 'Pilas de recambio para mandos',
  'First aid kit stock': 'Stock del botiquín',
  'Mop, dustpan, broom, handles, and bucket condition':
    'Estado de mopa, recogedor, escoba, palos y cubo',
  'Electronic locks': 'Cerraduras electrónicas',
  'Wall condition': 'Estado de las paredes',
  'Check mailbox': 'Revisar buzón',
  'Fire extinguisher': 'Extintor',
  'Extractor fan and light': 'Extractor y luz',
  Countertop: 'Encimera',
  'Dining table and chairs': 'Mesa y sillas de comedor',
  'Tableware, cutlery and glasses': 'Vajilla, cubertería y vasos',
  'Pots and pans': 'Ollas y sartenes',
  Knifes: 'Cuchillos',
  Microwave: 'Microondas',
  'Kitchen cabinets': 'Armarios de cocina',
  'Sofa and fabric chairs': 'Sofá y sillas tapizadas',
  'Washer machine maintenance': 'Mantenimiento de la lavadora',
  Rugs: 'Alfombras',
  'Portable heaters': 'Calefactores portátiles',
  Dishwasher: 'Lavavajillas',
  'Dishwasher pods': 'Pastillas de lavavajillas',
  'Under-bed storage': 'Almacenaje bajo la cama',
  'TV wall base': 'Soporte de TV en pared',
  'Portable fan': 'Ventilador portátil',
  'Coffee table': 'Mesa de centro',
  'Ceiling fans': 'Ventiladores de techo',
  'TV stand / wall base': 'Mueble / soporte de TV',
  'Washer machine': 'Lavadora',
  'Mugs, glasses wine glasses and little spoons':
    'Tazas, vasos, copas y cucharillas',
  Patio: 'Patio',
  'Exterior bars and grilles': 'Rejas y barrotes exteriores',
  'Gas meter reading': 'Lectura del contador de gas',
  'Boiler pressure': 'Presión de la caldera',
  'TV stand': 'Mueble de TV',
  'Desk chair': 'Silla de escritorio',
  Balcony: 'Balcón',
  Sofa: 'Sofá',
  'Desk fabric chair': 'Silla tapizada de escritorio',
  'Sofa and desk chair': 'Sofá y silla de escritorio',
  'Wall condition (and bricks wall)': 'Estado de las paredes (y muro de ladrillo)',
  Beams: 'Vigas',
  'Shampoo, shower gel and hand soap': 'Shampoo, gel de ducha y jabon de manos',
  'Shampoo, shower gel and hand soap (all bathrooms)':
    'Shampoo, gel de ducha y jabon de manos',
  'Shampoo, shower gel and hand soap in the bathroom (at least half full)':
    'Shampoo, gel de ducha y jabon de manos',
  'Shampoo, shower gel and hand soap in the bathroom (at least half full) - all bathrooms':
    'Shampoo, gel de ducha y jabon de manos',
  'Cleaning under the sofa and inside if it\'s sofa bed':
    'Limpieza debajo del sofá y dentro si es sofá cama',
  'Cleaning / order under the bed': 'Limpieza / orden debajo de la cama',
  'Cleaning mirrors, windows, and the shower screen':
    'Limpieza de espejos, ventanas y mampara de ducha',
  'Water drains properly through the shower drain':
    'El agua drena bien por el desagüe de la ducha',
  'Glasses, wine glasses, plates, kitchen utensils, and silverware are clean and complete (there should be at least one extra of each item based on the apartment’s capacity)':
    'Vasos, copas, platos, utensilios de cocina y cubertería están limpios y completos (debe haber al menos uno extra de cada artículo según la capacidad del apartamento)',
  'Pots and pans are in good condition, and there are at least two of each type':
    'Las ollas y sartenes están en buen estado y hay al menos dos de cada tipo',
  'The coffee maker has no capsules inside and is clean':
    'La cafetera no tiene cápsulas dentro y está limpia',
  'Toaster and kettle clean': 'Tostadora y hervidor limpios',
  'Wi-Fi connection': 'Conexión Wi-Fi',
  'Netflix logged in': 'Netflix iniciado',
  'Sheets and pillows are free of hair and stains':
    'Las sábanas y almohadas no tienen pelos ni manchas',
  'Washing machine, dishwasher (if present), refrigerator, oven, and microwave are empty and clean':
    'Lavadora, lavavajillas (si hay), nevera, horno y microondas están vacíos y limpios',
  'Air conditioner/heat pump is working properly':
    'El aire acondicionado o bomba de calor funciona correctamente',
  'Lightbulbs work': 'Las bombillas funcionan',
  'Book safe is locked and has a card inside (if the next reservation is for 2 nights, there won’t be a card, only for reservations of 3 nights or more). The code is 841. If there is a card, you’ll know it’s correct because it has a future date on it. Change the combination after checking.':
    'La caja fuerte de libro está cerrada y tiene una tarjeta dentro (si la siguiente reserva es de 2 noches no habrá tarjeta, solo para reservas de 3 noches o más). El código es 841. Si hay tarjeta, sabrás que es correcta porque tiene una fecha futura. Cambia la combinación después de comprobarlo.',
  'Electric air freshener has liquid': 'El ambientador eléctrico tiene líquido',
  'Windows are securely closed': 'Las ventanas están bien cerradas',
  'Electronic lock': 'Cerradura electrónica',
  'Guest key': 'Llave de huésped',
  'Remote controls TV and a/c working': 'Mandos de TV y A/A funcionan',
  'Table under stairs cleaning': 'Limpieza de la mesa bajo las escaleras',
  'Clock is functional': 'El reloj funciona',
  'Cleaning on top of the washing machine': 'Limpieza encima de la lavadora',
  'Staircase cleaning': 'Limpieza de la escalera',
  'Insects presence': 'Presencia de insectos',
  'Dining chairs stability': 'Estabilidad de las sillas de comedor',
  'Lock apartment door (until it has electronic lock)':
    'Cerrar la puerta del apartamento (hasta que tenga cerradura electrónica)',
}

const TEMPLATE_TASK_DESCRIPTION_ES: Record<string, string> = {
  'Battery level and charge/battery change':
    'Nivel de batería y carga o cambio de batería',
  'Battery change if needed': 'Cambio de batería si hace falta',
}

const BATHROOMS_SUFFIX = /\s*\((?:in )?all bathrooms\)\s*$/i

export const normalizeTemplateTaskTitle = (title: string) =>
  title.trim().replace(BATHROOMS_SUFFIX, '').replace(/\s+/g, ' ').trim()

const normalizeLookupKey = (title: string) =>
  normalizeTemplateTaskTitle(title)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const TEMPLATE_TASK_TITLE_ES_LOOKUP = new Map(
  Object.entries(TEMPLATE_TASK_TITLE_ES).flatMap(([english, spanish]) => {
    const raw = english.trim().toLowerCase()
    const normalized = normalizeLookupKey(english)
    return [
      [raw, spanish],
      [normalized, spanish],
    ] as Array<[string, string]>
  }),
)

const TEMPLATE_TASK_DESCRIPTION_ES_LOOKUP = new Map(
  Object.entries(TEMPLATE_TASK_DESCRIPTION_ES).flatMap(([english, spanish]) => {
    const normalized = normalizeLookupKey(english)
    return [
      [english.trim().toLowerCase(), spanish],
      [normalized, spanish],
    ] as Array<[string, string]>
  }),
)

export const displayTaskTitle = (
  language: string | undefined,
  title: string,
  titleEs?: string | null,
) => {
  const normalized = normalizeTemplateTaskTitle(title)
  if (!isSpanishLocale(language)) {
    return normalized || title
  }
  const custom = titleEs?.trim()
  if (custom) {
    return custom
  }
  return (
    TEMPLATE_TASK_TITLE_ES_LOOKUP.get(normalizeLookupKey(title)) ??
    TEMPLATE_TASK_TITLE_ES_LOOKUP.get(normalizeLookupKey(normalized)) ??
    TEMPLATE_TASK_TITLE_ES_LOOKUP.get(title.trim().toLowerCase()) ??
    normalized
  )
}

export const displayTaskDescription = (
  language: string | undefined,
  description?: string | null,
) => {
  const text = description?.trim() ?? ''
  if (!text) {
    return ''
  }
  if (!isSpanishLocale(language)) {
    return text
  }
  return (
    TEMPLATE_TASK_DESCRIPTION_ES_LOOKUP.get(normalizeLookupKey(text)) ??
    TEMPLATE_TASK_DESCRIPTION_ES_LOOKUP.get(text.toLowerCase()) ??
    text
  )
}
