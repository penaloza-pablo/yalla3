/**
 * Nav catalog filters for production IA.
 * RBAC page keys stay in rbac-catalog.ts; this file only decides what is shown.
 *
 * To launch a new section: follow docs/design/UX_ARCHITECTURE.md
 * "Incorporación de módulos", then remove it from HIDDEN_NAV_SECTIONS.
 */
import type { NavGroup } from '../../amplify/functions/shared/rbac-catalog'

export const HIDDEN_NAV_SECTIONS = new Set(['Grow'])

export const visibleNavGroups = (groups: NavGroup[]): NavGroup[] =>
  groups.filter((group) => !HIDDEN_NAV_SECTIONS.has(group.section))
