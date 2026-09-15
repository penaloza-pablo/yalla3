export class KnockKnockCheckin extends HTMLElement {
  guests: import('./CheckinWidget').CheckinGuest[];
  selectedId: string | undefined;
  busy: boolean;
  error: string;
}
