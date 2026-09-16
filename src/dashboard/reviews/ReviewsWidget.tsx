import type { CSSProperties } from 'react'
import { reviewState, reviewsCopy } from './reviews-model.mjs'
import './reviews.css'

export const REVIEWS_IMAGE_SRC = '/widgets/hospitality-door.jpg'

export interface ReviewsWidgetProps {
  /** Pending reviews under 5 stars from the Reviews table. */
  activeCount: number | null
  imageSrc?: string
  variant?: 'editorial' | 'postcard'
  locale?: string
  error?: string
  className?: string
  style?: CSSProperties
}

export function ReviewsWidget({
  activeCount,
  imageSrc = REVIEWS_IMAGE_SRC,
  variant = 'editorial',
  locale = 'en',
  error,
  className = '',
  style,
}: ReviewsWidgetProps) {
  const copy = reviewsCopy(locale)
  let state: ReturnType<typeof reviewState> | null = null
  let problem = error
  try {
    state = reviewState(activeCount, locale)
  } catch {
    problem = problem || copy.invalid
  }
  const clear = state?.kind === 'clear'
  const pending = state?.kind === 'loading' && !problem
  const calmTitle = variant === 'postcard' ? copy.upToDateTitle : copy.calmTitle

  return (
    <section
      className={`kk-reviews ${variant === 'postcard' ? 'kr-postcard' : ''} ${
        clear && !problem ? 'kr-clear' : ''
      } ${className}`.trim()}
      style={style}
      aria-label={copy.ariaLabel}
      aria-busy={pending}
    >
      <img className="kr-photo" src={imageSrc} alt="" />
      <div className="kr-shade" aria-hidden="true" />
      <header className="kr-header">
        <h2 className="kr-heading">{copy.heading}</h2>
        {!problem && !pending ? (
          clear ? (
            <span className="kr-mark" aria-hidden="true">
              ✓
            </span>
          ) : (
            <span className="kr-tag">{copy.tag}</span>
          )
        ) : null}
      </header>
      {problem || pending ? (
        <p className="kr-message" role={problem ? 'alert' : 'status'}>
          {problem || copy.loading}
        </p>
      ) : (
        state && (
          <>
            <div className="kr-body" aria-hidden="true">
              {clear ? (
                <>
                  <p className="kr-clear-title">
                    {calmTitle[0]}
                    <br />
                    {calmTitle[1]}
                  </p>
                  <p className="kr-description">
                    {copy.nonePendingLines[0]}
                    <br />
                    {copy.nonePendingLines[1]}
                  </p>
                </>
              ) : (
                <>
                  <strong
                    className={`kr-count ${activeCount! >= 1000 ? 'kr-long' : ''}`}
                  >
                    {activeCount}
                  </strong>
                  <p className="kr-label">
                    {variant === 'postcard'
                      ? copy.postcardLabel
                      : copy.inReview(activeCount!)}
                  </p>
                  {variant === 'editorial' ? (
                    <p className="kr-description">{copy.caption}</p>
                  ) : null}
                </>
              )}
            </div>
            <span className="kr-sr" role="status" aria-live="polite">
              {state.label}
            </span>
          </>
        )
      )}
    </section>
  )
}
