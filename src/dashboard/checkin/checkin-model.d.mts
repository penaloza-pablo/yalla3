import type { CheckinGuest, Visit, CheckinAction } from './CheckinWidget';
export const STAGES: readonly string[];
export function previousDay(date: string): string;
export function openVisits(guest: CheckinGuest): Visit[];
export function getStage(guest: CheckinGuest): 0 | 1 | 2 | 3;
export function transition(guest: CheckinGuest, action: CheckinAction): CheckinGuest;
