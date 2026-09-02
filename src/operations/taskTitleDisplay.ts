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
}

export const displayTaskTitle = (
  language: string | undefined,
  title: string,
  titleEs?: string | null,
) => {
  if (!isSpanishLocale(language)) {
    return title
  }
  const custom = titleEs?.trim()
  if (custom) {
    return custom
  }
  return TEMPLATE_TASK_TITLE_ES[title.trim()] ?? title
}
