export const FIVE_STAR_REVIEW_STATUS = '5 stars';
export const RESCUED_REVIEW_STATUS = 'closed - review deleted';

export type PropertyReportReview = {
  id: string;
  reservationId: string;
  guestName: string;
  status: string;
  rating: number;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const normalizeReviewStatus = (status: string) =>
  status.trim().toLowerCase();

export const isFiveStarReview = (status: string, rating: number) => {
  const normalized = normalizeReviewStatus(status);
  if (normalized === FIVE_STAR_REVIEW_STATUS) {
    return true;
  }
  return (
    (normalized === '' || normalized === 'done') &&
    Number.isFinite(rating) &&
    rating >= 5
  );
};

export const isRescuedReview = (status: string) =>
  normalizeReviewStatus(status) === RESCUED_REVIEW_STATUS;

export const mapReportReview = (
  item: Record<string, unknown>,
): PropertyReportReview | null => {
  const id = asString(item.ReviewID) || asString(item.reviewId);
  const reservationId =
    asString(item.ReservationID) || asString(item.reservationId);
  if (!id || !reservationId) {
    return null;
  }
  return {
    id,
    reservationId,
    guestName: asString(item.GuestName) || asString(item.guestName) || '—',
    status: asString(item.Status) || asString(item.status),
    rating: asNumber(item.Rating) ?? asNumber(item.rating) ?? 0,
  };
};

export const reviewsForReservationIds = (
  items: Record<string, unknown>[],
  reservationIds: Iterable<string>,
) => {
  const allowed = new Set(
    [...reservationIds].map((id) => id.trim()).filter(Boolean),
  );
  if (allowed.size === 0) {
    return [];
  }
  const seen = new Set<string>();
  const reviews: PropertyReportReview[] = [];
  for (const item of items) {
    const review = mapReportReview(item);
    if (!review || seen.has(review.id) || !allowed.has(review.reservationId)) {
      continue;
    }
    seen.add(review.id);
    reviews.push(review);
  }
  reviews.sort((left, right) => {
    const guest = left.guestName.localeCompare(right.guestName);
    if (guest !== 0) {
      return guest;
    }
    return left.id.localeCompare(right.id);
  });
  return reviews;
};

export const summarizeReportReviews = (reviews: PropertyReportReview[]) => {
  let fiveStarReviewCount = 0;
  let underFiveStarReviewCount = 0;
  let rescuedUnderFiveStarReviewCount = 0;
  for (const review of reviews) {
    if (isFiveStarReview(review.status, review.rating)) {
      fiveStarReviewCount += 1;
      continue;
    }
    underFiveStarReviewCount += 1;
    if (isRescuedReview(review.status)) {
      rescuedUnderFiveStarReviewCount += 1;
    }
  }
  const rescuedUnderFiveStarReviewPercent =
    underFiveStarReviewCount > 0
      ? roundMoney(
          (rescuedUnderFiveStarReviewCount / underFiveStarReviewCount) * 100,
        )
      : 0;
  return {
    fiveStarReviewCount,
    underFiveStarReviewCount,
    rescuedUnderFiveStarReviewCount,
    rescuedUnderFiveStarReviewPercent,
  };
};
