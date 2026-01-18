import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { getInventory } from './functions/get-inventory/resource';
import { upsertInventory } from './functions/upsert-inventory/resource';
import { getAlerts } from './functions/get-alerts/resource';
import { updateAlertStatus } from './functions/update-alert-status/resource';

const backend = defineBackend({
  auth,
  data,
  getInventory,
  upsertInventory,
  getAlerts,
  updateAlertStatus,
});

const getInventoryUrl = backend.getInventory.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertInventoryUrl = backend.upsertInventory.resources.lambda.addFunctionUrl(
  {
    authType: FunctionUrlAuthType.NONE,
  },
);
const getAlertsUrl = backend.getAlerts.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const updateAlertStatusUrl =
  backend.updateAlertStatus.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });

backend.addOutput({
  custom: {
    getInventoryUrl: getInventoryUrl.url,
    upsertInventoryUrl: upsertInventoryUrl.url,
    getAlertsUrl: getAlertsUrl.url,
    updateAlertStatusUrl: updateAlertStatusUrl.url,
  },
});
