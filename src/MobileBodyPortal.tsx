import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const MOBILE_QUERY = '(max-width: 768px)'

export function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isMobile
}

export function MobileBodyPortal({ children }: { children: ReactNode }) {
  const isMobile = useIsMobileLayout()
  if (!isMobile || typeof document === 'undefined') {
    return <>{children}</>
  }
  return createPortal(children, document.body)
}
