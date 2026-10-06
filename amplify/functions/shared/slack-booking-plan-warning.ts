import { loadSlackSecrets, slackApi } from './slack';
import { escapeMrkdwn } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import {
  type ResolvableWarningCode,
  warningLabel,
} from './booking-plan-warning-cleaner';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const notifyBookingPlanWarningCleared = async (input: {
  reservationId: string;
  warningCode: ResolvableWarningCode;
  value: string;
  quote: string;
  guestName?: string;
  property?: string;
  confirmationCode?: string;
}) => {
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.bookingPlanWarningCleared,
    ))
  ) {
    return false;
  }
  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Booking Plan warning cleaner Slack skipped: missing warningsChannelId.',
    );
    return false;
  }
  const property = asString(input.property) || 'unknown property';
  const guest = asString(input.guestName) || 'unknown guest';
  const code = asString(input.confirmationCode) || input.reservationId;
  const quote = asString(input.quote).slice(0, 280);
  const text = [
    'Booking Plan: warning resuelto por el agente.',
    `Propiedad: ${escapeMrkdwn(property)}`,
    `Huésped: ${escapeMrkdwn(guest)}`,
    `Reserva: ${escapeMrkdwn(code)}`,
    `Warning: ${escapeMrkdwn(warningLabel(input.warningCode))}`,
    `Valor: ${escapeMrkdwn(input.value)}`,
    `Cita del guest: "${escapeMrkdwn(quote)}"`,
  ].join('\n');
  await slackApi('chat.postMessage', {
    channel: warningsChannelId,
    text,
  });
  return true;
};
