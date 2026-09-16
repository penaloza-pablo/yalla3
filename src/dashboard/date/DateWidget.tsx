import { useId, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getTodayMadrid } from '../../operations/dateHelpers'
import { dateAllowed, dateParts } from './date-model.mjs'
import './date.css'

export const DATE_IMAGE_SRC = {
  door: '/widgets/date-door.jpg',
  balconies: '/widgets/date-balconies.jpg',
  welcome: '/widgets/date-welcome.jpg',
  staircase: '/widgets/date-staircase.jpg',
} as const

export interface DateWidgetProps {
  /** Civil date in the application's business time zone, not a timestamp. */
  value: string
  onDateChange: (date: string) => void
  variant?: 'photo' | 'editorial'
  imageSrc?: string
  minDate?: string
  maxDate?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

export function DateWidget({
  value,
  onDateChange,
  variant = 'photo',
  imageSrc,
  minDate,
  maxDate,
  disabled = false,
  className = '',
  style,
}: DateWidgetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')

  let parts: ReturnType<typeof dateParts> | null = null
  try {
    parts = dateParts(value, locale)
    dateAllowed(value, minDate, maxDate)
  } catch {
    parts = null
  }

  const close = () => {
    dialog.current?.close()
    trigger.current?.focus()
  }

  const open = () => {
    if (disabled) {
      return
    }
    setDraft(value)
    setError('')
    dialog.current?.showModal()
    input.current?.focus()
  }

  const goToday = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) {
      return
    }
    const today = getTodayMadrid()
    try {
      if (!dateAllowed(today, minDate, maxDate)) {
        return
      }
    } catch {
      return
    }
    if (today !== value) {
      onDateChange(today)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) {
      return
    }
    try {
      if (!dateAllowed(draft, minDate, maxDate)) {
        setError(t('dashboard.dateRangeError'))
        return
      }
    } catch {
      setError(t('dashboard.dateInvalidInput'))
      return
    }
    close()
    if (draft !== value) {
      onDateChange(draft)
    }
  }

  if (!parts) {
    return (
      <div className={`kk-date ${className}`.trim()} style={style}>
        <p className="kd-invalid" role="alert">
          {t('dashboard.dateInvalid')}
        </p>
      </div>
    )
  }

  return (
    <div className={`kk-date ${className}`.trim()} style={style}>
      <div
        className={`kd-column${variant === 'editorial' ? ' kd-editorial' : ''}${
          disabled ? ' is-disabled' : ''
        }`}
      >
        {variant === 'photo' ? (
          <>
            {imageSrc ? <img src={imageSrc} className="kd-photo" alt="" /> : null}
            <span className="kd-shade" aria-hidden="true" />
          </>
        ) : (
          <span className="kd-door-art" aria-hidden="true" />
        )}
        <span className="kd-eyebrow" aria-hidden="true">
          {t('dashboard.dateEyebrow')}
        </span>
        <time className="kd-date" dateTime={value} aria-hidden="true">
          <span className="kd-day">{parts.day}</span>
          <span className="kd-month">{parts.month}</span>
          <span className="kd-weekday">{parts.weekday}</span>
        </time>
        <span className="kd-footer" aria-hidden="true">
          <span className="kd-year">{parts.year}</span>
          <span className="kd-change">
            <span>{t('dashboard.dateChange')}</span>
            <span>↗</span>
          </span>
        </span>
        <button
          type="button"
          ref={trigger}
          className="kd-open"
          onClick={open}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={t('dashboard.dateAria', { full: parts.full })}
        />
        <button
          type="button"
          className="kd-today"
          onClick={goToday}
          disabled={disabled}
          aria-label={t('dashboard.dateToday')}
        >
          <svg className="kd-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v16H4ZM8 3v4M16 3v4M4 10h16" />
          </svg>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="kd-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClose={() => trigger.current?.focus()}
      >
        <form onSubmit={submit}>
          <h2 id={`${id}-title`}>{t('dashboard.dateChangeTitle')}</h2>
          <p id={`${id}-description`}>{t('dashboard.dateChangeDescription')}</p>
          <label htmlFor={`${id}-input`}>{t('dashboard.dateInputLabel')}</label>
          <input
            ref={input}
            id={`${id}-input`}
            type="date"
            required
            value={draft}
            min={minDate}
            max={maxDate}
            onChange={(event) => {
              setDraft(event.target.value)
              setError('')
            }}
          />
          {error ? (
            <div className="kd-form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="kd-actions">
            <button type="button" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="kd-apply" type="submit" disabled={disabled}>
              {t('dashboard.dateApply')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
