const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export type CleaningPlanVisitChange = {
  visitId: string;
  title?: string;
  listingLabel?: string;
  guestName?: string;
  confirmationCode?: string;
  previousDate?: string;
  nextDate?: string;
  previousStatus?: string;
  nextStatus?: string;
  isCreate?: boolean;
};

export const toCleaningPlanDateOnly = (value?: string) => {
  const match = asString(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
};

export const datesToReopenForVisitChange = (
  previousDate?: string,
  nextDate?: string,
) =>
  [
    ...new Set(
      [
        toCleaningPlanDateOnly(previousDate),
        toCleaningPlanDateOnly(nextDate),
      ].filter(Boolean),
    ),
  ];

export const describeCleaningPlanVisitChange = (
  change: CleaningPlanVisitChange,
) => {
  const lines: string[] = [];
  const who = [change.listingLabel, change.title, change.guestName]
    .map((value) => asString(value))
    .filter(Boolean);
  if (who.length > 0) {
    lines.push(who.join(' · '));
  }
  const confirmation = asString(change.confirmationCode);
  if (confirmation) {
    lines.push(`Reserva ${confirmation}`);
  }
  const fromDate = asString(change.previousDate);
  const toDate = asString(change.nextDate);
  if (fromDate && toDate && fromDate !== toDate) {
    lines.push(`Fecha: ${fromDate} → ${toDate}`);
  } else if (change.isCreate && toDate) {
    lines.push(`Visita nueva el ${toDate}`);
  }
  const fromStatus = asString(change.previousStatus).toUpperCase();
  const toStatus = asString(change.nextStatus).toUpperCase();
  if (toStatus === 'CANCELLED' && fromStatus !== 'CANCELLED') {
    lines.push('Estado: cancelada');
  }
  return lines;
};
