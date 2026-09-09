import type { EventBridgeHandler } from 'aws-lambda';
import { materializeCurrentMonth } from '../shared/finance-services-store';

export const handler: EventBridgeHandler<'Scheduled Event', void, void> =
  async () => {
    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error('TABLE_NAME is not configured.');
    }
    await materializeCurrentMonth(tableName);
  };
