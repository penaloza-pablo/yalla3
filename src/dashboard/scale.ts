import type {
  DashboardColSpan,
  DashboardLayout,
  DashboardRowSpan,
  DashboardWidgetDefinition,
  DashboardWidgetPlacement,
  DashboardWidgetScale,
} from './types'
import {
  DASHBOARD_CELL_PX,
  DASHBOARD_COLUMNS,
  DASHBOARD_GAP_PX,
  scaleKey,
} from './types'

export type ResolvedWidget = {
  placement: DashboardWidgetPlacement
  scale: DashboardWidgetScale
}

export const fitTracks = (available: number, cell = DASHBOARD_CELL_PX, gap = DASHBOARD_GAP_PX) => {
  if (available < cell) {
    return 0
  }
  return Math.max(0, Math.floor((available + gap) / (cell + gap)))
}

export const largestScale = (
  scales: DashboardWidgetScale[],
): DashboardWidgetScale | null => {
  if (scales.length === 0) {
    return null
  }
  return [...scales].sort(
    (left, right) =>
      right.colSpan * right.rowSpan - left.colSpan * left.rowSpan ||
      right.colSpan - left.colSpan ||
      right.rowSpan - left.rowSpan,
  )[0]
}

export const fallbackChain = (
  preferredCol: DashboardColSpan,
  preferredRow: DashboardRowSpan,
  scales: DashboardWidgetScale[],
): DashboardWidgetScale[] => {
  const unique = new Map<string, DashboardWidgetScale>()
  for (const scale of scales) {
    if (scale.colSpan <= preferredCol && scale.rowSpan <= preferredRow) {
      unique.set(scaleKey(scale.colSpan, scale.rowSpan), scale)
    }
  }
  const list = [...unique.values()]
  const sameCol = list
    .filter((scale) => scale.colSpan === preferredCol)
    .sort((left, right) => right.rowSpan - left.rowSpan)
  const smallerCol = list
    .filter((scale) => scale.colSpan < preferredCol)
    .sort(
      (left, right) =>
        right.colSpan - left.colSpan || right.rowSpan - left.rowSpan,
    )
  return [...sameCol, ...smallerCol]
}

export const packRows = (
  items: Array<{ colSpan: number; rowSpan: number }>,
  columns: number,
) => {
  if (items.length === 0 || columns < 1) {
    return 0
  }
  const occupied: boolean[][] = []
  const ensureRow = (row: number) => {
    while (occupied.length <= row) {
      occupied.push(Array.from({ length: columns }, () => false))
    }
  }
  const canPlace = (row: number, col: number, colSpan: number, rowSpan: number) => {
    if (col + colSpan > columns) {
      return false
    }
    for (let currentRow = row; currentRow < row + rowSpan; currentRow += 1) {
      ensureRow(currentRow)
      for (let currentCol = col; currentCol < col + colSpan; currentCol += 1) {
        if (occupied[currentRow][currentCol]) {
          return false
        }
      }
    }
    return true
  }
  const occupy = (row: number, col: number, colSpan: number, rowSpan: number) => {
    for (let currentRow = row; currentRow < row + rowSpan; currentRow += 1) {
      ensureRow(currentRow)
      for (let currentCol = col; currentCol < col + colSpan; currentCol += 1) {
        occupied[currentRow][currentCol] = true
      }
    }
  }

  for (const item of items) {
    const colSpan = Math.min(item.colSpan, columns)
    const rowSpan = item.rowSpan
    let placed = false
    for (let row = 0; !placed; row += 1) {
      for (let col = 0; col <= columns - colSpan; col += 1) {
        if (canPlace(row, col, colSpan, rowSpan)) {
          occupy(row, col, colSpan, rowSpan)
          placed = true
          break
        }
      }
    }
  }
  return occupied.length
}

export const resolveVisibleWidgets = (
  layout: DashboardLayout,
  widgetsById: Map<string, DashboardWidgetDefinition>,
  availableWidth: number,
  availableHeight: number,
): { widgets: ResolvedWidget[]; columns: number } => {
  const maxCols = Math.min(
    DASHBOARD_COLUMNS,
    fitTracks(availableWidth, DASHBOARD_CELL_PX, DASHBOARD_GAP_PX),
  )
  const maxRows = Number.isFinite(availableHeight)
    ? fitTracks(availableHeight, DASHBOARD_CELL_PX, DASHBOARD_GAP_PX)
    : Number.POSITIVE_INFINITY
  if (maxCols < 1 || maxRows < 1) {
    return { widgets: [], columns: Math.max(1, maxCols) }
  }

  type Item = {
    placement: DashboardWidgetPlacement
    chain: DashboardWidgetScale[]
    index: number
  }

  const items: Item[] = []
  for (const placement of layout.widgets) {
    const definition = widgetsById.get(placement.widgetId)
    if (!definition) {
      continue
    }
    const chain = fallbackChain(
      placement.colSpan,
      placement.rowSpan,
      definition.scales,
    )
    const index = chain.findIndex(
      (scale) => scale.colSpan <= maxCols && scale.rowSpan <= maxRows,
    )
    if (index < 0) {
      continue
    }
    items.push({ placement, chain, index })
  }

  const heightOf = (list: Item[]) =>
    packRows(
      list.map((item) => ({
        colSpan: item.chain[item.index].colSpan,
        rowSpan: item.chain[item.index].rowSpan,
      })),
      maxCols,
    )

  while (items.length > 0 && heightOf(items) > maxRows) {
    items.pop()
  }

  return {
    columns: maxCols,
    widgets: items.map((item) => ({
      placement: item.placement,
      scale: item.chain[item.index],
    })),
  }
}
