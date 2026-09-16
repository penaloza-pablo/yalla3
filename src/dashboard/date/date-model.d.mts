export function dateLocale(lang?: string): 'en' | 'es'
export function parseDate(value: string): {
  year: number
  month: number
  day: number
  date: Date
}
export function dateParts(
  value: string,
  lang?: string,
): {
  day: string
  month: string
  year: string
  weekday: string
  full: string
}
export function dateAllowed(value: string, min?: string, max?: string): boolean
