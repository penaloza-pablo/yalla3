import { useEffect, useState } from 'react'

export type DeviceLayout = 'mobile' | 'tablet' | 'desktop'

/** Portrait phones and compact viewports. */
export const MOBILE_MEDIA = '(max-width: 768px)'
/** iPad-class widths; landscape phones also land here. */
export const TABLET_MEDIA = '(min-width: 769px) and (max-width: 1023px)'

export function readDeviceLayout(): DeviceLayout {
  if (typeof window === 'undefined') {
    return 'desktop'
  }
  if (window.matchMedia(MOBILE_MEDIA).matches) {
    return 'mobile'
  }
  if (window.matchMedia(TABLET_MEDIA).matches) {
    return 'tablet'
  }
  return 'desktop'
}

export function useDeviceLayout(): DeviceLayout {
  const [layout, setLayout] = useState<DeviceLayout>(readDeviceLayout)

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_MEDIA)
    const tablet = window.matchMedia(TABLET_MEDIA)
    const sync = () => {
      if (mobile.matches) {
        setLayout('mobile')
        return
      }
      if (tablet.matches) {
        setLayout('tablet')
        return
      }
      setLayout('desktop')
    }
    sync()
    mobile.addEventListener('change', sync)
    tablet.addEventListener('change', sync)
    return () => {
      mobile.removeEventListener('change', sync)
      tablet.removeEventListener('change', sync)
    }
  }, [])

  return layout
}
