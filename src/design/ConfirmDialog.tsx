import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      setPending((current) => {
        current?.resolve(false)
        return { ...options, resolve }
      })
    })
  }, [])

  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div
          className="modal-overlay yl-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="yl-confirm-title"
        >
          <div className="modal yl-confirm">
            <div className="modal-header">
              <h3 className="modal-title" id="yl-confirm-title">
                {pending.title || t('common.confirm')}
              </h3>
            </div>
            <div className="modal-body">
              <p className="yl-confirm-message">{pending.message}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => close(false)}
              >
                {pending.cancelLabel || t('common.cancel')}
              </button>
              <button
                type="button"
                className={pending.destructive ? 'btn-danger' : 'btn-primary'}
                onClick={() => close(true)}
              >
                {pending.confirmLabel || t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return confirm
}
