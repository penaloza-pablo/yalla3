import type { TeamRecord } from './types'

const TEAM_COLOR_RGB: Record<string, string> = {
  limpieza: '229, 32, 82',
  mantenimiento: '23, 158, 198',
  management: '255, 130, 71',
}

export const TEAM_LANE_ORDER: Array<keyof typeof TEAM_COLOR_RGB> = [
  'limpieza',
  'mantenimiento',
  'management',
]

const TEAM_NAME_ALIASES: Record<string, keyof typeof TEAM_COLOR_RGB> = {
  limpieza: 'limpieza',
  cleaning: 'limpieza',
  mantenimiento: 'mantenimiento',
  maintenance: 'mantenimiento',
  management: 'management',
}

const normalizeTeamKey = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

  if (TEAM_NAME_ALIASES[normalized]) {
    return TEAM_NAME_ALIASES[normalized]
  }

  if (normalized.includes('clean') || normalized.includes('limpiez')) {
    return 'limpieza'
  }
  if (normalized.includes('maint') || normalized.includes('manten')) {
    return 'mantenimiento'
  }
  if (normalized.includes('manag')) {
    return 'management'
  }

  return normalized
}

export const getTeamRgb = (teamId: string, teamById: Map<string, string>) => {
  const name = teamById.get(teamId) ?? teamId
  const nameKey = normalizeTeamKey(name)
  if (TEAM_COLOR_RGB[nameKey]) {
    return TEAM_COLOR_RGB[nameKey]
  }
  const idKey = normalizeTeamKey(teamId)
  return TEAM_COLOR_RGB[idKey] ?? '152, 162, 179'
}

export const getTeamColorStyle = (
  teamId: string,
  teamById: Map<string, string>,
) => {
  const rgb = getTeamRgb(teamId, teamById)
  return {
    '--team-color': `rgb(${rgb})`,
    '--team-color-soft': `rgba(${rgb}, 0.18)`,
    '--team-color-border': `rgba(${rgb}, 0.55)`,
  } as Record<string, string>
}

export const getTeamBlockStyle = (
  teamId: string,
  teamById: Map<string, string>,
) => {
  const rgb = getTeamRgb(teamId, teamById)
  return {
    '--team-color': `rgb(${rgb})`,
    '--team-color-border': `rgba(255, 255, 255, 0.45)`,
    background: `rgb(${rgb})`,
    color: '#ffffff',
  } as Record<string, string>
}

export const getTeamStripeGradient = (
  teamIds: string[],
  teamById: Map<string, string>,
) => {
  const uniqueTeamIds = [...new Set(teamIds)]
  if (uniqueTeamIds.length === 0) {
    return 'rgb(152, 162, 179)'
  }
  if (uniqueTeamIds.length === 1) {
    return `rgb(${getTeamRgb(uniqueTeamIds[0], teamById)})`
  }
  const colors = uniqueTeamIds.map(
    (teamId) => `rgb(${getTeamRgb(teamId, teamById)})`,
  )
  if (colors.length === 2) {
    return `repeating-linear-gradient(135deg, ${colors[0]} 0 10px, ${colors[1]} 10px 20px)`
  }
  return `repeating-linear-gradient(135deg, ${colors[0]} 0 8px, ${colors[1]} 8px 16px, ${colors[2]} 16px 24px)`
}

export const buildTeamByIdMap = (teams: TeamRecord[]) =>
  new Map(teams.map((team) => [team.id, team.name]))

export const getTeamSortKey = (teamId: string, teamById: Map<string, string>) =>
  normalizeTeamKey(teamById.get(teamId) ?? teamId)

const compareTeamKeyOrder = (
  keyA: string,
  keyB: string,
  order: readonly (keyof typeof TEAM_COLOR_RGB)[],
) => {
  const idxA = order.indexOf(keyA as (typeof order)[number])
  const idxB = order.indexOf(keyB as (typeof order)[number])

  if (idxA === -1 && idxB === -1) {
    return keyA.localeCompare(keyB)
  }
  if (idxA === -1) {
    return 1
  }
  if (idxB === -1) {
    return -1
  }
  return idxA - idxB
}

export const compareTeamLaneOrder = (
  teamIdA: string,
  teamIdB: string,
  teamById: Map<string, string>,
) =>
  compareTeamKeyOrder(
    getTeamSortKey(teamIdA, teamById),
    getTeamSortKey(teamIdB, teamById),
    TEAM_LANE_ORDER,
  )

/** When two teams start at the same time, Maintenance is shown first. */
const TEAM_TIME_TIE_BREAK_ORDER: Array<keyof typeof TEAM_COLOR_RGB> = [
  'mantenimiento',
  'limpieza',
  'management',
]

export const compareTeamTimeTieBreak = (
  teamIdA: string,
  teamIdB: string,
  teamById: Map<string, string>,
) =>
  compareTeamKeyOrder(
    getTeamSortKey(teamIdA, teamById),
    getTeamSortKey(teamIdB, teamById),
    TEAM_TIME_TIE_BREAK_ORDER,
  )

export const sortTeamIdsByLane = (
  teamIds: string[],
  teamById: Map<string, string>,
) =>
  [...new Set(teamIds)].sort((teamIdA, teamIdB) =>
    compareTeamLaneOrder(teamIdA, teamIdB, teamById),
  )
