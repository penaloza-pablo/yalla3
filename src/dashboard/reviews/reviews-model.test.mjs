import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  reviewState,
  countActiveReviews,
  countPendingReviewsUnderFive,
} from './reviews-model.mjs'

const row = { id: '1', rating: 4, recovery: 'in_progress', deletion: 'pending' }

test('zero is a calm state, missing is loading', () => {
  assert.equal(reviewState(0, 'es').kind, 'clear')
  assert.equal(reviewState(null, 'es').kind, 'loading')
  assert.ok(!reviewState(0, 'es').label.includes('0'))
})

test('singular, plural and invalid totals', () => {
  assert.equal(reviewState(1, 'es').label, '1 reseña en gestión')
  assert.equal(reviewState(3, 'es').label, '3 reseñas en gestión')
  for (const value of [-1, NaN, Infinity, 1.5, undefined]) {
    assert.throws(() => reviewState(value, 'es'))
  }
})

test('English labels stay available', () => {
  assert.equal(reviewState(1, 'en').label, '1 review in review')
  assert.equal(reviewState(0, 'en').label, 'No pending reviews')
})

test('one review is one case even when both workflows are open', () =>
  assert.equal(countActiveReviews([row]), 1))

test('count below five stars only while at least one process remains open', () => {
  assert.equal(countActiveReviews([{ ...row, rating: 5 }]), 0)
  assert.equal(
    countActiveReviews([{ ...row, recovery: 'closed', deletion: 'closed' }]),
    0,
  )
  assert.equal(countActiveReviews([{ ...row, recovery: 'closed' }]), 1)
  assert.equal(
    countActiveReviews([{ ...row, recovery: 'not_needed', deletion: 'in_progress' }]),
    1,
  )
  assert.equal(countActiveReviews([]), 0)
})

test('duplicate records and incomplete workflow states are rejected', () => {
  assert.throws(() => countActiveReviews([row, row]))
  assert.throws(() => countActiveReviews([{ ...row, deletion: undefined }]))
})

test('pending reviews under five match the Reviews table filter', () => {
  assert.equal(
    countPendingReviewsUnderFive([
      { ReviewID: 'a', Status: 'pending', Rating: 4 },
      { reviewId: 'b', status: 'Pending', rating: 3.5 },
      { id: 'c', status: 'closed', rating: 2 },
      { id: 'd', status: 'pending', rating: 5 },
      { id: 'e', status: 'pending', rating: 0 },
      { id: 'f', status: 'Working', rating: 3 },
      { id: 'g', status: 'working', rating: 5 },
    ]),
    4,
  )
})
