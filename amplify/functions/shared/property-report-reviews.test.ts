import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFiveStarReview,
  isRescuedReview,
  reviewsForReservationIds,
  summarizeReportReviews,
} from './property-report-reviews';

test('classifies 5-star status and unlabeled 5-star ratings', () => {
  assert.equal(isFiveStarReview('5 stars', 5), true);
  assert.equal(isFiveStarReview('5 Stars', 4), true);
  assert.equal(isFiveStarReview('', 5), true);
  assert.equal(isFiveStarReview('Done', 5), true);
  assert.equal(isFiveStarReview('', 4), false);
  assert.equal(isFiveStarReview('Pending', 3), false);
  assert.equal(isFiveStarReview('Closed - Review deleted', 0), false);
});

test('classifies rescued reviews by Closed - Review deleted', () => {
  assert.equal(isRescuedReview('Closed - Review deleted'), true);
  assert.equal(isRescuedReview('Closed - Review no deleted'), false);
  assert.equal(isRescuedReview('Closed - Skipped'), false);
});

test('keeps reviews on the reservation check-in month ids', () => {
  const reviews = reviewsForReservationIds(
    [
      {
        ReviewID: 'r-aug',
        ReservationID: 'stay-aug',
        GuestName: 'Ana',
        Status: '5 stars',
        Rating: 5,
      },
      {
        ReviewID: 'r-sep',
        ReservationID: 'stay-sep',
        GuestName: 'Beto',
        Status: 'Pending',
        Rating: 3,
      },
      {
        ReviewID: 'r-missing',
        ReservationID: '',
        GuestName: 'Cara',
        Status: '5 stars',
        Rating: 5,
      },
    ],
    ['stay-aug'],
  );
  assert.deepEqual(
    reviews.map((row) => row.id),
    ['r-aug'],
  );
});

test('summarizes five-star, under-five and rescued percent', () => {
  const summary = summarizeReportReviews([
    {
      id: 'a',
      reservationId: '1',
      guestName: 'Ada',
      status: '5 stars',
      rating: 5,
    },
    {
      id: 'b',
      reservationId: '2',
      guestName: 'Bea',
      status: '',
      rating: 5,
    },
    {
      id: 'c',
      reservationId: '3',
      guestName: 'Cam',
      status: 'Pending',
      rating: 3,
    },
    {
      id: 'd',
      reservationId: '4',
      guestName: 'Dee',
      status: 'Closed - Review deleted',
      rating: 0,
    },
    {
      id: 'e',
      reservationId: '5',
      guestName: 'Eve',
      status: 'Closed - Review no deleted',
      rating: 4,
    },
  ]);
  assert.equal(summary.fiveStarReviewCount, 2);
  assert.equal(summary.underFiveStarReviewCount, 3);
  assert.equal(summary.rescuedUnderFiveStarReviewCount, 1);
  assert.equal(summary.rescuedUnderFiveStarReviewPercent, 33.33);
});

test('rescued percent is 0 when there are no under-five reviews', () => {
  const summary = summarizeReportReviews([
    {
      id: 'a',
      reservationId: '1',
      guestName: 'Ada',
      status: '5 stars',
      rating: 5,
    },
  ]);
  assert.equal(summary.rescuedUnderFiveStarReviewPercent, 0);
});
