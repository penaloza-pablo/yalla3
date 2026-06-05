import type { VisitTypeRecord } from './types'

export const sortVisitTypes = (visitTypes: VisitTypeRecord[]) =>
  [...visitTypes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
