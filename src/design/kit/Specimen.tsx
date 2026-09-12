import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type SpecimenProps = {
  refName: string
  title: string
  usage: string
  desktop: ReactNode
  mobile?: ReactNode
}

export function Specimen({
  refName,
  title,
  usage,
  desktop,
  mobile,
}: SpecimenProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const hasVariant = mobile !== undefined

  const copyRef = () => {
    const fallback = () => {
      const field = document.createElement('textarea')
      field.value = refName
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.insetInlineStart = '-9999px'
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(refName).catch(fallback)
    } else {
      fallback()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <article className="yl-specimen">
      <div className="yl-specimen-head">
        <div className="yl-specimen-copy">
          <h2 className="yl-specimen-title">{title}</h2>
          <p className="yl-specimen-ref">{refName}</p>
          <p className="yl-specimen-usage">{usage}</p>
        </div>
        <button
          className="btn-secondary yl-specimen-copy-btn"
          type="button"
          onClick={copyRef}
        >
          {copied ? t('kit.copied') : t('kit.copyRef')}
        </button>
      </div>
      <div className={`yl-kit-frames ${hasVariant ? '' : 'is-single'}`}>
        <div className="yl-kit-stage is-desktop">
          <p className="yl-kit-stage-label">
            {hasVariant ? t('kit.desktop') : t('kit.sameOnBoth')}
          </p>
          {desktop}
        </div>
        {hasVariant ? (
          <div className="yl-kit-stage is-mobile">
            <p className="yl-kit-stage-label">{t('kit.mobile')}</p>
            {mobile}
          </div>
        ) : null}
      </div>
    </article>
  )
}
