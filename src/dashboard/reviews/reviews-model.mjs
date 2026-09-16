const EN = {
  heading: 'Reviews',
  tag: 'In review',
  loading: 'Loading reviews…',
  invalid: 'Unable to read the reviews indicator.',
  ariaLabel: 'Reviews needing attention',
  nonePending: 'No pending reviews',
  nonePendingLines: ['No pending', 'reviews'],
  postcardLabel: 'in review',
  calmTitle: ['All', 'calm.'],
  upToDateTitle: ['Up to', 'date.'],
  caption: 'Every stay counts.',
  inReview: () => 'Needs attention',
  inReviewFull: (count) =>
    `${count} ${count === 1 ? 'needs attention' : 'need attention'}`,
}

const ES = {
  heading: 'Reseñas',
  tag: 'En gestión',
  loading: 'Cargando reseñas…',
  invalid: 'No se pudo leer el indicador de reseñas.',
  ariaLabel: 'Reseñas que requieren atención',
  nonePending: 'Sin reseñas pendientes',
  nonePendingLines: ['Sin reseñas', 'pendientes'],
  postcardLabel: 'en gestión',
  calmTitle: ['Todo en', 'calma.'],
  upToDateTitle: ['Al', 'día.'],
  caption: 'Cada experiencia cuenta.',
  inReview: (count) =>
    count === 1 ? 'Requiere atención' : 'Requieren atención',
  inReviewFull: (count) =>
    `${count} ${count === 1 ? 'requiere atención' : 'requieren atención'}`,
}

export function reviewsLocale(lang) {
  return String(lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function reviewsCopy(lang) {
  return reviewsLocale(lang) === 'es' ? ES : EN
}

export function reviewState(activeCount, lang = 'en') {
  const copy = reviewsCopy(lang)
  if (activeCount === null) {
    return { kind: 'loading', label: copy.loading }
  }
  if (!Number.isSafeInteger(activeCount) || activeCount < 0) {
    throw new TypeError('activeCount debe ser un entero no negativo o null.')
  }
  if (activeCount === 0) {
    return { kind: 'clear', label: copy.nonePending }
  }
  return {
    kind: 'active',
    label: copy.inReviewFull(activeCount),
    count: activeCount,
  }
}

/** Distinct reviews, either workflow open, no date filter. */
export function countActiveReviews(records) {
  const ids = new Set()
  const active = new Set()
  const statuses = ['pending', 'in_progress', 'closed', 'not_needed']
  for (const row of records) {
    if (!row.id || ids.has(row.id)) {
      throw new TypeError('Cada reseña debe tener un id único.')
    }
    ids.add(row.id)
    if (
      typeof row.rating !== 'number' ||
      !Number.isFinite(row.rating) ||
      row.rating < 1 ||
      row.rating > 5 ||
      !statuses.includes(row.recovery) ||
      !statuses.includes(row.deletion)
    ) {
      throw new TypeError('Reseña con datos incompletos o inválidos.')
    }
    if (
      row.rating < 5 &&
      [row.recovery, row.deletion].some(
        (status) => status === 'pending' || status === 'in_progress',
      )
    ) {
      active.add(row.id)
    }
  }
  return active.size
}

/** Pending reviews under 5 stars, matching the Reviews table filter. */
export function countPendingReviewsUnderFive(records) {
  const ids = new Set()
  let count = 0
  for (const row of records ?? []) {
    const id = String(row?.id ?? row?.reviewId ?? row?.ReviewID ?? '').trim()
    if (!id || ids.has(id)) {
      continue
    }
    ids.add(id)
    const rating = Number(row?.rating ?? row?.Rating)
    const status = String(row?.status ?? row?.Status ?? '')
      .trim()
      .toLowerCase()
    if (
      (status === 'pending' || status === 'working') &&
      Number.isFinite(rating) &&
      rating < 5
    ) {
      count += 1
    }
  }
  return count
}
