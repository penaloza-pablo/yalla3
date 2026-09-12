import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDeviceLayout } from './nav/layout'

export function useIsMobileLayout() {
  return useDeviceLayout() === 'mobile'
}

export function MobileBodyPortal({ children }: { children: ReactNode }) {
  const isMobile = useIsMobileLayout()
  if (!isMobile || typeof document === 'undefined') {
    return <>{children}</>
  }
  return createPortal(children, document.body)
}
