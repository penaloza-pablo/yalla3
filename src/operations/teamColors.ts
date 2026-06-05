import type { TeamRecord } from './types'

const TEAM_COLOR_RGB: Record<string, string> = {
  limpieza: '229, 32, 82',
  mantenimiento: '23, 158, 198',
  management: '255, 130, 71',
}

const normalizeTeamKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/maintenance/g, 'mantenimiento')

export const getTeamRgb = (teamId: string, teamById: Map<string, string>) => {
  const name = teamById.get(teamId) ?? teamId
  const key = normalizeTeamKey(name)
  return TEAM_COLOR_RGB[key] ?? '152, 162, 179'
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
