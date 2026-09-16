import { createElement, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

export interface Visit {
  id: string
  type: 'cleaning' | 'maintenance' | 'other'
  /** Calendar day in the property's time zone. */
  date: string
  closed: boolean
}
export interface CheckinGuest {
  id: string
  name: string
  property: string
  checkInDate: string
  accessGranted: boolean
  entered: boolean
  visits: Visit[]
}
export type CheckinAction =
  | 'grant-access'
  | 'mark-entered'
  | 'undo-entry'
  | 'revoke-access'
export interface CheckinWidgetProps {
  guests: CheckinGuest[]
  variant?: 'journey' | 'threshold'
  selectedId?: string
  busy?: boolean
  error?: string
  lang?: string
  onAction: (event: { id: string; action: CheckinAction }) => void
  onGuestChange?: (event: { id: string; index: number }) => void
  className?: string
  style?: CSSProperties & Record<`--kk-${string}`, string>
}
interface WidgetElement extends HTMLElement {
  guests: CheckinGuest[]
  selectedId: string | undefined
  busy: boolean
  error: string
}

const syncElement = (
  element: WidgetElement,
  {
    guests,
    selectedId,
    busy,
    error,
  }: Pick<CheckinWidgetProps, 'guests' | 'selectedId' | 'busy' | 'error'>,
) => {
  element.guests = guests
  if (selectedId !== undefined) {
    element.selectedId = selectedId
  }
  element.busy = Boolean(busy)
  element.error = error ?? ''
}

/** Controlled React adapter over the Trayecto/Umbral web component. */
export function CheckinWidget({
  guests,
  variant = 'journey',
  selectedId,
  busy = false,
  error = '',
  lang = 'en',
  onAction,
  onGuestChange,
  className,
  style,
}: CheckinWidgetProps) {
  const ref = useRef<WidgetElement | null>(null)
  const onActionRef = useRef(onAction)
  const onGuestChangeRef = useRef(onGuestChange)
  onActionRef.current = onAction
  onGuestChangeRef.current = onGuestChange

  useEffect(() => {
    let disposed = false
    const element = ref.current
    const handleAction = (event: Event) =>
      onActionRef.current(
        (event as CustomEvent<{ id: string; action: CheckinAction }>).detail,
      )
    const handleGuest = (event: Event) =>
      onGuestChangeRef.current?.(
        (event as CustomEvent<{ id: string; index: number }>).detail,
      )
    void import('./checkin-widget.js').then(() => {
      const current = ref.current
      if (disposed || !current) {
        return
      }
      current.addEventListener('checkin-action', handleAction)
      current.addEventListener('guest-change', handleGuest)
      syncElement(current, { guests, selectedId, busy, error })
    })
    return () => {
      disposed = true
      element?.removeEventListener('checkin-action', handleAction)
      element?.removeEventListener('guest-change', handleGuest)
    }
  }, [busy, error, guests, selectedId])

  return createElement('kk-checkin', { ref, variant, className, style, lang })
}
