import { defineFunction } from '@aws-amplify/backend';

export const diagnoseYallaServices = defineFunction({
  runtime: 22,
  name: 'DiagnoseYallaServices',
  entry: './handler.ts',
  environment: {
    SLACK_SECRET_ID: 'yalla/slack',
    BOOKINGS_RECEIVER_FUNCTION: 'yalla-bookingsReceiver',
    TASKS_RECEIVER_FUNCTION: 'yalla-tasksReceiver',
    SYNC_TASK_TO_GUESTY_FUNCTION: 'yalla-syncTaskToGuesty',
    OPS_TABLES: 'yalla-bookings,yalla-visits,yalla-tasks,yalla-properties',
    APP_BASE_URL: 'https://main.dd8kh4wy2zlme.amplifyapp.com',
  },
  timeoutSeconds: 120,
});
