const BUSINESS_TIMEZONE = 'Europe/Madrid';

export const PURCHASE_WAITING_DELIVERY = 'Waiting Delivery';
export const PURCHASE_OVERDUE = 'Overdue';
export const PURCHASE_WAITING_INVOICE = 'Waiting invoice';
export const PURCHASE_COMPLETED = 'Completed';
export const PURCHASE_EXCLUDED = 'Excluded';
export const PURCHASE_CONFIRMED_LEGACY = 'Confirmed';
export const PURCHASE_TO_BE_CONFIRMED_LEGACY = 'To be confirmed';

export const RECEIVED_PURCHASE_STATUSES = new Set([
  PURCHASE_WAITING_INVOICE,
  PURCHASE_COMPLETED,
  PURCHASE_CONFIRMED_LEGACY,
]);

export const OPEN_PURCHASE_STATUSES = new Set([
  PURCHASE_WAITING_DELIVERY,
  PURCHASE_OVERDUE,
  PURCHASE_TO_BE_CONFIRMED_LEGACY,
]);

export const ACTIVE_PURCHASE_STATUSES = new Set([
  PURCHASE_WAITING_DELIVERY,
  PURCHASE_OVERDUE,
  PURCHASE_WAITING_INVOICE,
  PURCHASE_TO_BE_CONFIRMED_LEGACY,
]);

export const DEFAULT_PURCHASE_FILTER_STATUSES = [
  PURCHASE_WAITING_DELIVERY,
  PURCHASE_OVERDUE,
  PURCHASE_WAITING_INVOICE,
];

export const PURCHASE_WARNING_STATUSES = [
  PURCHASE_OVERDUE,
  PURCHASE_WAITING_INVOICE,
] as const;

export const purchaseBusinessToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(now);

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asExplicitBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return undefined;
};

export const purchaseDeliveryIso = (value?: string) => {
  const trimmed = asString(value);
  if (!trimmed) {
    return '';
  }
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return '';
};

export const readPurchaseStatus = (item: Record<string, unknown>) =>
  asString(item.Status) || asString(item.status);

export const isExcludedPurchaseRecord = (item: Record<string, unknown>) => {
  const excluded = asExplicitBoolean(item.Excluded ?? item.excluded);
  if (excluded !== undefined) {
    return excluded;
  }
  return readPurchaseStatus(item) === PURCHASE_EXCLUDED;
};

export const isReceivedPurchaseStatus = (value?: string) =>
  RECEIVED_PURCHASE_STATUSES.has(asString(value));

export const isOpenPurchaseStatus = (value?: string) =>
  OPEN_PURCHASE_STATUSES.has(asString(value));

export const isPendingPurchaseStatus = (value?: string) => {
  const status = asString(value);
  return (
    status === PURCHASE_WAITING_DELIVERY ||
    status === PURCHASE_OVERDUE ||
    status === PURCHASE_WAITING_INVOICE ||
    status === PURCHASE_TO_BE_CONFIRMED_LEGACY
  );
};

export const readPurchaseReceived = (item: Record<string, unknown>) => {
  const flagged = asExplicitBoolean(item.Received ?? item.received);
  if (flagged !== undefined) {
    return flagged;
  }
  return isReceivedPurchaseStatus(readPurchaseStatus(item));
};

export const readPurchaseInvoice = (item: Record<string, unknown>) => {
  const flagged = asExplicitBoolean(item.Invoice ?? item.invoice);
  if (flagged !== undefined) {
    return flagged;
  }
  const status = readPurchaseStatus(item);
  return status === PURCHASE_COMPLETED || status === PURCHASE_CONFIRMED_LEGACY;
};

export const computePurchaseLifecycleStatus = (params: {
  excluded?: boolean;
  received?: boolean;
  invoice?: boolean;
  deliveryDate?: string;
  today?: string;
}) => {
  if (params.excluded) {
    return PURCHASE_EXCLUDED;
  }
  if (params.received) {
    return params.invoice ? PURCHASE_COMPLETED : PURCHASE_WAITING_INVOICE;
  }
  const deliveryIso = purchaseDeliveryIso(params.deliveryDate);
  const today = params.today || purchaseBusinessToday();
  if (deliveryIso && deliveryIso < today) {
    return PURCHASE_OVERDUE;
  }
  return PURCHASE_WAITING_DELIVERY;
};

export const resolvePurchaseLifecycle = (
  item: Record<string, unknown>,
  today = purchaseBusinessToday(),
) => {
  const excluded = isExcludedPurchaseRecord(item);
  const received = readPurchaseReceived(item);
  const invoice = readPurchaseInvoice(item);
  const deliveryDate =
    asString(item['Delivery date']) ||
    asString(item.deliveryDate) ||
    asString(item.DeliveryDate);
  const status = computePurchaseLifecycleStatus({
    excluded,
    received,
    invoice,
    deliveryDate,
    today,
  });
  return { excluded, received, invoice, deliveryDate, status };
};

export const decoratePurchaseRecord = (
  item: Record<string, unknown>,
  today = purchaseBusinessToday(),
) => {
  const resolved = resolvePurchaseLifecycle(item, today);
  return {
    ...item,
    Status: resolved.status,
    Invoice: resolved.invoice,
    Received: resolved.received,
    Excluded: resolved.excluded,
  };
};

export const resolveReceivedFromPayload = (
  payload: Record<string, unknown>,
  existing?: Record<string, unknown>,
) => {
  const flagged = asExplicitBoolean(payload.Received ?? payload.received);
  if (flagged !== undefined) {
    return flagged;
  }
  const payloadStatus = asString(payload.Status ?? payload.status);
  if (isReceivedPurchaseStatus(payloadStatus)) {
    return true;
  }
  if (existing) {
    return readPurchaseReceived(existing);
  }
  return false;
};

export const resolveInvoiceFromPayload = (
  payload: Record<string, unknown>,
  existing?: Record<string, unknown>,
) => {
  const flagged = asExplicitBoolean(payload.Invoice ?? payload.invoice);
  if (flagged !== undefined) {
    return flagged;
  }
  const payloadStatus = asString(payload.Status ?? payload.status);
  if (
    payloadStatus === PURCHASE_COMPLETED ||
    payloadStatus === PURCHASE_CONFIRMED_LEGACY
  ) {
    return true;
  }
  if (payloadStatus === PURCHASE_WAITING_INVOICE) {
    return false;
  }
  if (existing) {
    return readPurchaseInvoice(existing);
  }
  return false;
};
