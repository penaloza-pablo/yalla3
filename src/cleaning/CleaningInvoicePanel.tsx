import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { YlIcon } from '../design/icons'
import type { CleaningInvoiceMeta } from './types'

type InvoiceGroup = 'apartments' | 'p2'

type VerifyOutput = {
  saved?: boolean
  s3Key?: string
  invoiceNumber?: string
  billedTo?: string
  cif?: string
  monthOk?: boolean
  entityOk?: boolean
  comments?: string[]
  subtotal?: number
}

type ReconcileOutput = {
  invoiceNumber?: string
  matched?: unknown[]
  netted?: Array<{ reason?: string; descriptions?: string[]; amount?: number }>
  invoiceOnly?: Array<{ description?: string; units?: number; subtotal?: number }>
  yallaOnly?: Array<{
    property?: string
    cleaningTypeName?: string
    price?: number
  }>
  totals?: {
    invoiceExVat?: number
    yallaExVat?: number
    delta?: number
    favor?: 'provider' | 'yalla' | 'even'
  }
}

type Props = {
  monthId: string
  canEdit: boolean
  invoices?: { apartments?: CleaningInvoiceMeta; p2?: CleaningInvoiceMeta }
  agentsEndpoint?: string
  money: Intl.NumberFormat
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  showTrigger?: boolean
  onVerified: () => void
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const asToolOutput = <T,>(payload: { output?: unknown }): T | null =>
  payload.output && typeof payload.output === 'object'
    ? (payload.output as T)
    : null

export function CleaningInvoicePanel({
  monthId,
  canEdit,
  invoices,
  agentsEndpoint,
  money,
  isOpen,
  onOpen,
  onClose,
  showTrigger = false,
  onVerified,
}: Props) {
  const { t } = useTranslation()
  const [group, setGroup] = useState<InvoiceGroup>('apartments')
  const [file, setFile] = useState<File | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isReconciling, setIsReconciling] = useState(false)
  const [error, setError] = useState('')
  const [verify, setVerify] = useState<VerifyOutput | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileOutput | null>(null)

  useEffect(() => {
    setVerify(null)
    setReconcile(null)
    setError('')
    setFile(null)
  }, [monthId])

  const stored = invoices?.[group]

  const comments = useMemo(() => {
    if (verify?.comments?.length) {
      return verify.comments
    }
    return stored?.comments ?? []
  }, [stored?.comments, verify])

  const s3Key = verify?.s3Key || stored?.s3Key || ''
  const canValidate = Boolean(
    s3Key &&
      (verify
        ? verify.entityOk && verify.monthOk
        : stored?.entityOk && stored?.monthOk),
  )

  const runTool = async (tool: string, args: Record<string, unknown>) => {
    if (!agentsEndpoint) {
      throw new Error(t('cleaningBilling.missingInvoiceEndpoint'))
    }
    const response = await authFetch(agentsEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
    })
    const payload = (await response.json()) as {
      output?: unknown
      message?: string
    }
    if (!response.ok) {
      throw new Error(payload.message || t('cleaningBilling.invoiceError'))
    }
    return payload
  }

  const upload = async () => {
    if (!file) {
      setError(t('cleaningBilling.invoiceFileRequired'))
      return
    }
    setIsVerifying(true)
    setError('')
    setReconcile(null)
    try {
      const payload = await runTool('verify_cleaning_invoice', {
        monthId,
        group,
        fileName: file.name,
        fileBase64: await fileToBase64(file),
      })
      const output = asToolOutput<VerifyOutput>(payload)
      setVerify(output)
      setFile(null)
      onClose()
      onVerified()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningBilling.invoiceError'),
      )
    } finally {
      setIsVerifying(false)
    }
  }

  const validate = async () => {
    if (!s3Key) {
      return
    }
    setIsReconciling(true)
    setError('')
    try {
      const payload = await runTool('reconcile_cleaning_invoice', {
        monthId,
        group,
        s3Key,
      })
      setReconcile(asToolOutput<ReconcileOutput>(payload))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningBilling.invoiceError'),
      )
    } finally {
      setIsReconciling(false)
    }
  }

  const favorLabel = (favor?: string) => {
    if (favor === 'provider') {
      return t('cleaningBilling.invoiceFavorProvider')
    }
    if (favor === 'yalla') {
      return t('cleaningBilling.invoiceFavorYalla')
    }
    return t('cleaningBilling.invoiceFavorEven')
  }

  return (
    <>
      {showTrigger && canEdit ? (
        <button
          className="btn-secondary"
          type="button"
          onClick={() => {
            setError('')
            onOpen()
          }}
        >
          {t('cleaningBilling.uploadInvoice')}
        </button>
      ) : null}

      {comments.length > 0 || reconcile ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('cleaningBilling.invoiceTitle')}</h2>
              <p className="card-subtitle">{t('cleaningBilling.invoiceSubtitle')}</p>
            </div>
            {canValidate ? (
              <button
                className="btn-primary"
                type="button"
                disabled={isReconciling}
                onClick={() => void validate()}
              >
                {isReconciling
                  ? t('common.loading')
                  : t('cleaningBilling.validateInvoice')}
              </button>
            ) : null}
          </div>
          {error ? <p className="notice error">{error}</p> : null}
          {verify?.invoiceNumber || stored?.invoiceNumber ? (
            <p>
              {t('cleaningBilling.invoiceNumber')}:{' '}
              {verify?.invoiceNumber || stored?.invoiceNumber}
            </p>
          ) : null}
          {comments.length > 0 ? (
            <ul>
              {comments.map((comment) => (
                <li key={comment}>{comment}</li>
              ))}
            </ul>
          ) : null}
          {reconcile?.totals ? (
            <div>
              <p>
                {t('cleaningBilling.invoiceExVat')}:{' '}
                {money.format(Number(reconcile.totals.invoiceExVat ?? 0))}
              </p>
              <p>
                {t('cleaningBilling.yallaExVat')}:{' '}
                {money.format(Number(reconcile.totals.yallaExVat ?? 0))}
              </p>
              <p>
                {t('cleaningBilling.invoiceDelta')}:{' '}
                {money.format(Number(reconcile.totals.delta ?? 0))} —{' '}
                {favorLabel(reconcile.totals.favor)}
              </p>
              {(reconcile.invoiceOnly?.length ?? 0) > 0 ? (
                <>
                  <h3 className="card-title">{t('cleaningBilling.invoiceOnly')}</h3>
                  <ul>
                    {reconcile.invoiceOnly?.map((line, index) => (
                      <li key={`inv-${index}`}>
                        {line.description} — {money.format(Number(line.subtotal ?? 0))}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {(reconcile.yallaOnly?.length ?? 0) > 0 ? (
                <>
                  <h3 className="card-title">{t('cleaningBilling.yallaOnly')}</h3>
                  <ul>
                    {reconcile.yallaOnly?.map((line, index) => (
                      <li key={`yalla-${index}`}>
                        {line.property} · {line.cleaningTypeName} —{' '}
                        {money.format(Number(line.price ?? 0))}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {(reconcile.netted?.length ?? 0) > 0 ? (
                <>
                  <h3 className="card-title">{t('cleaningBilling.invoiceNetted')}</h3>
                  <ul>
                    {reconcile.netted?.map((entry, index) => (
                      <li key={`net-${index}`}>
                        {(entry.descriptions ?? []).join(' / ')} —{' '}
                        {money.format(Number(entry.amount ?? 0))}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : error ? (
        <p className="notice error">{error}</p>
      ) : null}

      {isOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('cleaningBilling.uploadInvoice')}</h3>
                <p className="modal-subtitle">{t('cleaningBilling.uploadInvoiceHint')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <label className="form-field">
                <span>{t('cleaningBilling.invoiceGroup')}</span>
                <select
                  value={group}
                  onChange={(event) => setGroup(event.target.value as InvoiceGroup)}
                >
                  <option value="apartments">
                    {t('cleaningBilling.chip.apartments')}
                  </option>
                  <option value="p2">{t('cleaningBilling.chip.p2')}</option>
                </select>
              </label>
              <label className="form-field">
                <span>{t('cleaningBilling.invoiceFile')}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {error && isOpen ? <p className="notice error">{error}</p> : null}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" type="button" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isVerifying || !file}
                onClick={() => void upload()}
              >
                {isVerifying ? t('common.loading') : t('cleaningBilling.saveInvoice')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
