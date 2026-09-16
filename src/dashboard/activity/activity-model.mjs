const EN = {
  metrics: [
    { key: 'checkins', label: 'Check-ins', empty: 'No arrivals', number: '01' },
    { key: 'cleaning', label: 'Cleaning', empty: 'No cleanings', number: '02' },
    { key: 'maintenance', label: 'Maintenance', empty: 'No maintenance', number: '03' },
  ],
  orbitNames: { checkins: 'Check-ins', cleaning: 'Cleanings', maintenance: 'Maintenance jobs' },
  completedOf: (completed, total) => `${completed} of ${total} completed`,
  inDay: 'today',
  allSet: 'All set',
  jobsToday: 'Jobs today',
  happening: "What's happening",
  today: 'Today',
  activity: 'Activity',
  loading: 'Loading activity…',
  invalid: 'Unable to show activity. Check the totals received.',
  earlyAria: (value) => `${value} Early check-ins, included in the total`,
  totalAria: (total) => `${total} in total`,
};

const ES = {
  metrics: [
    { key: 'checkins', label: 'Check-ins', empty: 'Sin llegadas', number: '01' },
    { key: 'cleaning', label: 'Limpieza', empty: 'Sin limpiezas', number: '02' },
    { key: 'maintenance', label: 'Mantenimiento', empty: 'Sin mantenimientos', number: '03' },
  ],
  orbitNames: { checkins: 'Check-ins', cleaning: 'Limpiezas', maintenance: 'Mantenimientos' },
  completedOf: (completed, total) => `${completed} de ${total} completados`,
  inDay: 'en el día',
  allSet: 'Todo listo',
  jobsToday: 'Trabajos del día',
  happening: 'Qué está pasando',
  today: 'Hoy',
  activity: 'Actividad',
  loading: 'Cargando actividad…',
  invalid: 'No se pudo mostrar la actividad. Revisa los totales recibidos.',
  earlyAria: (value) => `${value} Early check-ins, incluidos en el total`,
  totalAria: (total) => `${total} en total`,
};

export const METRICS = EN.metrics;

export function activityLocale(lang) {
  return String(lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function activityCopy(lang) {
  return activityLocale(lang) === 'es' ? ES : EN;
}

export function validateActivity(data) {
  for (const { key } of EN.metrics) {
    const value = data?.[key];
    if (!value || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.completed) || value.total < 0 || value.completed < 0 || value.completed > value.total) {
      throw new TypeError(`${key}: se requiere 0 ≤ completed ≤ total, con enteros seguros.`);
    }
  }
  if (!Number.isSafeInteger(data.checkins.early) || data.checkins.early < 0 || data.checkins.early > data.checkins.total) throw new TypeError('early debe ser un subconjunto del total de check-ins.');
  return data;
}

export function activityRows(data, lang = 'en') {
  validateActivity(data);
  const copy = activityCopy(lang);
  return copy.metrics.map(metric => {
    const counts = data[metric.key];
    const ratio = counts.total ? counts.completed / counts.total : 0;
    return { ...metric, ...counts, ratio, percent: ratio * 100,
      caption: counts.total ? copy.completedOf(counts.completed, counts.total) : metric.empty,
      complete: counts.total > 0 && counts.completed === counts.total };
  });
}

export function frequencySegments(ratio, count = 28) {
  return Array.from({length:count}, (_,i) => Math.max(0, Math.min(1, ratio * count - i)));
}

export function orbitCaption(row, lang = 'en') {
  const names = activityCopy(lang).orbitNames;
  const connector = activityLocale(lang) === 'es' ? 'de' : 'of';
  return `${row.completed} ${connector} ${row.total} ${names[row.key]}`;
}
