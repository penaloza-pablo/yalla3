const EN = {
  labels: {
    maintenance: 'Maintenance Plan',
    cleaning: 'Cleaning Plan',
    bookings: 'Bookings Plan',
  },
  title: 'Planning',
  ariaLabel: 'Planning status',
  loading: 'Loading planning…',
  invalid: 'Unable to show planning. Check the data received.',
  allSet: 'All set',
  pending: 'Pending',
  noData: 'No data',
  closedTodayTomorrow: 'closed plans (today and tomorrow)',
  withoutAlarms: 'without alarms',
  recordsWithoutAlarms: 'Records without alarms',
  plansTodayTomorrow: 'Today and tomorrow plans closed',
  todayTomorrow: 'Today and tomorrow',
  locale: 'en',
}

const ES = {
  labels: {
    maintenance: 'Plan de mantenimiento',
    cleaning: 'Plan de limpieza',
    bookings: 'Plan de reservas',
  },
  title: 'Planificación',
  ariaLabel: 'Estado de planificación',
  loading: 'Cargando planificación…',
  invalid: 'No se pudo mostrar la planificación. Revisa los datos.',
  allSet: 'Todo listo',
  pending: 'Pendiente',
  noData: 'Sin datos',
  closedTodayTomorrow: 'planes cerrados (hoy y mañana)',
  withoutAlarms: 'sin alarmas',
  recordsWithoutAlarms: 'Registros sin alarmas',
  plansTodayTomorrow: 'Planes de hoy y mañana cerrados',
  todayTomorrow: 'Hoy y mañana',
  locale: 'es',
}

export function planningLocale(lang) {
  return String(lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function planningCopy(lang) {
  return planningLocale(lang) === 'es' ? ES : EN
}

export function formatPlanningPercent(ratio, lang = 'en') {
  return `${new Intl.NumberFormat(planningCopy(lang).locale, {
    maximumFractionDigits: 1,
  }).format(ratio * 100)} %`
}

export function planningRows(data, lang = 'en') {
  const copy = planningCopy(lang)
  return Object.entries(copy.labels).map(([key, label]) => {
    const value = data?.[key]
    if (
      !value ||
      !Number.isSafeInteger(value.total) ||
      !Number.isSafeInteger(value.completed) ||
      value.total < 0 ||
      value.completed < 0 ||
      value.completed > value.total ||
      (key !== 'bookings' && value.total !== 2)
    ) {
      throw new TypeError(`Datos inválidos: ${key}`)
    }
    const ratio = value.total ? value.completed / value.total : 0
    return {
      key,
      label,
      ...value,
      ratio,
      percent: value.total ? formatPlanningPercent(ratio, lang) : '—',
      ready: value.total > 0 && value.completed === value.total,
    }
  })
}

export function planningStatus(rows, lang = 'en') {
  const copy = planningCopy(lang)
  if (rows.every((row) => row.ready)) {
    return copy.allSet
  }
  if (rows.some((row) => row.total === 0)) {
    return copy.noData
  }
  return copy.pending
}

export function ringPath(radius) {
  const d = radius / Math.sqrt(2)
  return `M ${110 - d} ${79 + d} A ${radius} ${radius} 0 1 1 ${110 + d} ${79 + d}`
}

export function radarGeometry(index) {
  const radius = 78 - index * 21
  const d = radius / Math.sqrt(2)
  return {
    radius,
    x: 110 - d,
    y: 123 + d,
    path: `M ${110 - d} ${123 + d} A ${radius} ${radius} 0 1 1 ${110 + d} ${123 + d}`,
  }
}

export const PLANNER_ICONS = {
  maintenance: 'M14 6a4 4 0 0 0-5-5l2 2-2 2-2-2a4 4 0 0 0 1 5L2 14l2 2 6-6a4 4 0 0 0 4-4Z',
  cleaning: 'M10 1 6 8M4 7l6 3-3 6H1l3-9ZM3 12l4 1',
  bookings: 'M2 3h12v12H2ZM5 1v4M11 1v4M2 7h12M5 11l2 2 4-4',
}
