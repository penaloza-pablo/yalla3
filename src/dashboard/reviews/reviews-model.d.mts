export type ReviewState =
  | { kind: 'loading'; label: string }
  | { kind: 'clear'; label: string }
  | { kind: 'active'; label: string; count: number }
export function reviewsLocale(lang?: string): 'en' | 'es'
export function reviewsCopy(lang?: string): {
  heading: string
  tag: string
  loading: string
  invalid: string
  ariaLabel: string
  nonePending: string
  nonePendingLines: [string, string]
  postcardLabel: string
  calmTitle: [string, string]
  upToDateTitle: [string, string]
  caption: string
  inReview: (count: number) => string
  inReviewFull: (count: number) => string
}
export function reviewState(activeCount: number | null, lang?: string): ReviewState
export interface ReviewRecord {
  id: string
  rating: number
  recovery: 'pending' | 'in_progress' | 'closed' | 'not_needed'
  deletion: 'pending' | 'in_progress' | 'closed' | 'not_needed'
}
export function countActiveReviews(records: ReviewRecord[]): number
export function countPendingReviewsUnderFive(
  records: Array<Record<string, unknown>>,
): number
