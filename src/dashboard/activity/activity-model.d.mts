import type { ActivityData, ActivityCount } from './ActivityWidget';
export interface ActivityRow extends ActivityCount {
  key: 'checkins' | 'cleaning' | 'maintenance'; label: string; empty: string; number: string;
  ratio: number; percent: number; caption: string; complete: boolean;
}
export const METRICS: Pick<ActivityRow, 'key' | 'label' | 'empty' | 'number'>[];
export function activityLocale(lang?: string): 'en' | 'es';
export function activityCopy(lang?: string): {
  metrics: Pick<ActivityRow, 'key' | 'label' | 'empty' | 'number'>[];
  orbitNames: Record<ActivityRow['key'], string>;
  completedOf: (completed: number, total: number) => string;
  inDay: string;
  allSet: string;
  jobsToday: string;
  happening: string;
  today: string;
  activity: string;
  loading: string;
  invalid: string;
  earlyAria: (value: number) => string;
  totalAria: (total: number) => string;
};
export function validateActivity(data: ActivityData): ActivityData;
export function activityRows(data: ActivityData, lang?: string): ActivityRow[];
export function frequencySegments(ratio: number, count?: number): number[];
export function orbitCaption(row: ActivityRow, lang?: string): string;
