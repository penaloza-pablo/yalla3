import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { getInventory } from './functions/get-inventory/resource';
import { upsertInventory } from './functions/upsert-inventory/resource';
import { getAlerts } from './functions/get-alerts/resource';
import { updateAlertStatus } from './functions/update-alert-status/resource';
import { upsertAlert } from './functions/upsert-alert/resource';
import { getInventoryRebuy } from './functions/get-inventory-rebuy/resource';
import { exportInventory } from './functions/export-inventory/resource';

const backend = defineBackend({
  auth,
  data,
  getInventory,
  upsertInventory,
  getAlerts,
  updateAlertStatus,
  upsertAlert,
  getInventoryRebuy,
  exportInventory,
});

const dataStack = backend.createStack('data-access');
const inventoryTable = Table.fromTableName(
  dataStack,
  'InventoryTable',
  'yalla-inventory',
);
const alarmsTable = Table.fromTableName(dataStack, 'AlarmsTable', 'yalla-alarms');
const inventoryBucket = Bucket.fromBucketName(
  dataStack,
  'InventoryExportBucket',
  'yalla-s3storage',
);

inventoryTable.grantReadData(backend.getInventory.resources.lambda);
inventoryTable.grantWriteData(backend.upsertInventory.resources.lambda);
inventoryTable.grantReadData(backend.getInventoryRebuy.resources.lambda);
inventoryTable.grantReadData(backend.exportInventory.resources.lambda);
alarmsTable.grantReadWriteData(backend.getAlerts.resources.lambda);
alarmsTable.grantWriteData(backend.updateAlertStatus.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertAlert.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertInventory.resources.lambda);
inventoryBucket.grantPut(backend.exportInventory.resources.lambda);

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
const upsertAlertUrl = backend.upsertAlert.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const exportInventoryUrl = backend.exportInventory.resources.lambda.addFunctionUrl(
  {
    authType: FunctionUrlAuthType.NONE,
  },
);

backend.addOutput({
  custom: {
    getInventoryUrl: getInventoryUrl.url,
    upsertInventoryUrl: upsertInventoryUrl.url,
    getAlertsUrl: getAlertsUrl.url,
    updateAlertStatusUrl: updateAlertStatusUrl.url,
    upsertAlertUrl: upsertAlertUrl.url,
    exportInventoryUrl: exportInventoryUrl.url,
  },
});
