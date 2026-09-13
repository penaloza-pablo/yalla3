export const NAV_MODES = ['sections', 'flat'] as const

export type NavMode = (typeof NAV_MODES)[number]

export const DEFAULT_NAV_MODE: NavMode = 'sections'

export const isNavMode = (value: unknown): value is NavMode =>
  value === 'sections' || value === 'flat'

export const parseNavMode = (value: unknown): NavMode =>
  isNavMode(value) ? value : DEFAULT_NAV_MODE
