type Props = {
  value?: number
  emptyLabel?: string
}

export function StarRating({ value, emptyLabel = '—' }: Props) {
  if (value === undefined || !Number.isFinite(value)) {
    return <span className="star-rating is-empty">{emptyLabel}</span>
  }
  const rounded = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <span className="star-rating" title={value.toFixed(1)}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`star-rating-star ${index < rounded ? 'is-filled' : ''}`}
        >
          ★
        </span>
      ))}
      <span className="star-rating-number">{value.toFixed(1)}</span>
    </span>
  )
}
