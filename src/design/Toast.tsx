import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastTone = 'success' | 'error'

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type ShowToast = (message: string, tone?: ToastTone) => void

const ToastContext = createContext<ShowToast | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback<ShowToast>((message, tone = 'success') => {
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current, { id, message: trimmed, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="yl-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`yl-toast ${item.tone === 'error' ? 'is-error' : ''}`}
            role="status"
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return show
}
