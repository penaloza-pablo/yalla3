const MONTHS = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],
}

export function dateLocale(lang) {
  return String(lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
}

export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('La fecha debe tener formato YYYY-MM-DD.')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(`${value}T12:00:00Z`)
  if (
    year < 1 ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError('Fecha no válida.')
  }
  return { year, month, day, date }
}

export function dateParts(value, lang) {
  const locale = dateLocale(lang)
  const { year, month, day, date } = parseDate(value)
  const intlLocale = locale === 'es' ? 'es' : 'en-GB'
  return {
    day: String(day).padStart(2, '0'),
    month: MONTHS[locale][month - 1],
    year: String(year).padStart(4, '0'),
    weekday: new Intl.DateTimeFormat(intlLocale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(date),
    full: new Intl.DateTimeFormat(intlLocale, {
      dateStyle: 'full',
      timeZone: 'UTC',
    }).format(date),
  }
}

export function dateAllowed(value, min, max) {
  parseDate(value)
  if (min) parseDate(min)
  if (max) parseDate(max)
  if (min && max && min > max) {
    throw new TypeError('minDate debe ser anterior o igual a maxDate.')
  }
  return (!min || value >= min) && (!max || value <= max)
}
