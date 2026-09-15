/* eslint-disable */
export const STAGES = ['Pendiente de trabajos', 'Propiedad lista', 'Acceso concedido', 'Ha entrado'];

// Calendar dates, already converted to the property's local time zone by the host.
export function previousDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('checkInDate debe ser YYYY-MM-DD');
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new TypeError('Fecha no válida');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function openVisits(guest) {
  const yesterday = previousDay(guest.checkInDate);
  return (guest.visits || []).filter(v =>
    ['cleaning', 'maintenance'].includes(v.type) && !v.closed &&
    [guest.checkInDate, yesterday].includes(v.date));
}

export function getStage(guest) {
  if (openVisits(guest).length) return 0;
  if (!guest.accessGranted) return 1;
  return guest.entered ? 3 : 2;
}

export function transition(guest, action) {
  const stage = getStage(guest);
  if (action === 'grant-access' && stage === 1) return { ...guest, accessGranted: true, entered: false };
  if (action === 'mark-entered' && stage === 2) return { ...guest, entered: true };
  if (action === 'undo-entry' && stage === 3) return { ...guest, entered: false };
  if (action === 'revoke-access' && stage === 2) return { ...guest, accessGranted: false, entered: false };
  throw new Error(`Acción ${action} no permitida desde ${STAGES[stage]}`);
}
