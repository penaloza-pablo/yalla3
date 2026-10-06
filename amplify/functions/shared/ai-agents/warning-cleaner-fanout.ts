import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  BOOKING_PLAN_WARNING_CLEANER_ID,
  listWarningCleanerTargets,
  type WarningCleanerTarget,
} from '../booking-plan-warning-cleaner';

const lambda = new LambdaClient({});

export const fanOutBookingPlanWarningCleaner = async () => {
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('AWS_LAMBDA_FUNCTION_NAME is not configured.');
  }
  const targets = await listWarningCleanerTargets();
  const invoked: string[] = [];
  const failed: Array<{ reservationId: string; error: string }> = [];
  for (const target of targets) {
    try {
      await invokeCleanerRun(functionName, target);
      invoked.push(target.reservationId);
    } catch (error) {
      failed.push({
        reservationId: target.reservationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    agentId: BOOKING_PLAN_WARNING_CLEANER_ID,
    count: targets.length,
    invoked: invoked.length,
    failed,
  };
};

const invokeCleanerRun = async (
  functionName: string,
  target: WarningCleanerTarget,
) => {
  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          agentId: BOOKING_PLAN_WARNING_CLEANER_ID,
          reservationId: target.reservationId,
          guestName: target.guestName,
          property: target.property,
          confirmationCode: target.confirmationCode,
          alerts: target.alerts,
        }),
      ),
    }),
  );
};
