import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { getInventory } from './functions/get-inventory/resource';
import { upsertInventory } from './functions/upsert-inventory/resource';
import { deleteInventory } from './functions/delete-inventory/resource';
import { getAlerts } from './functions/get-alerts/resource';
import { updateAlertStatus } from './functions/update-alert-status/resource';
import { upsertAlert } from './functions/upsert-alert/resource';
import { getInventoryRebuy } from './functions/get-inventory-rebuy/resource';
import { exportInventory } from './functions/export-inventory/resource';
import { getPurchases } from './functions/get-purchases/resource';
import { upsertPurchase } from './functions/upsert-purchase/resource';
import { getProperties } from './functions/get-properties/resource';
import { upsertProperty } from './functions/upsert-property/resource';
import { deleteProperty } from './functions/delete-property/resource';
import { getBookings } from './functions/get-bookings/resource';
import { getReviews } from './functions/get-reviews/resource';
import { getReviewsSyncState } from './functions/get-reviews-sync-state/resource';
import { updateReviewWorkflow } from './functions/update-review-workflow/resource';
import { getVisits } from './functions/get-visits/resource';
import { upsertVisit } from './functions/upsert-visit/resource';
import { getTasks } from './functions/get-tasks/resource';
import { upsertTask } from './functions/upsert-task/resource';
import { getTeams } from './functions/get-teams/resource';
import { getUsers } from './functions/get-users/resource';
import { getVisitTypes } from './functions/get-visit-types/resource';
import { getVisitTemplates } from './functions/get-visit-templates/resource';
import { upsertVisitTemplate } from './functions/upsert-visit-template/resource';
import { upsertVisitType } from './functions/upsert-visit-type/resource';

const backend = defineBackend({
  auth,
  data,
  getInventory,
  upsertInventory,
  deleteInventory,
  getAlerts,
  updateAlertStatus,
  upsertAlert,
  getInventoryRebuy,
  exportInventory,
  getPurchases,
  upsertPurchase,
  getProperties,
  upsertProperty,
  deleteProperty,
  getBookings,
  getReviews,
  getReviewsSyncState,
  updateReviewWorkflow,
  getVisits,
  upsertVisit,
  getTasks,
  upsertTask,
  getTeams,
  getUsers,
  getVisitTypes,
  getVisitTemplates,
  upsertVisitTemplate,
  upsertVisitType,
});

const dataStack = backend.createStack('data-access');
const inventoryTable = Table.fromTableName(
  dataStack,
  'InventoryTable',
  'yalla-inventory',
);
const alarmsTable = Table.fromTableName(dataStack, 'AlarmsTable', 'yalla-alarms');
const purchasesTable = Table.fromTableName(
  dataStack,
  'PurchasesTable',
  'yalla-purchases',
);
const propertiesTable = Table.fromTableName(
  dataStack,
  'PropertiesTable',
  'yalla-properties',
);
const bookingsTable = Table.fromTableName(
  dataStack,
  'BookingsTable',
  'yalla-bookings',
);
const reviewsTable = Table.fromTableName(dataStack, 'ReviewsTable', 'yalla-reviews');
const reviewSyncStateTable = Table.fromTableName(
  dataStack,
  'ReviewSyncStateTable',
  'yalla-reviewsync-state',
);
const visitsTable = Table.fromTableName(dataStack, 'VisitsTable', 'yalla-visits');
const tasksTable = Table.fromTableName(dataStack, 'TasksTable', 'yalla-tasks');
const teamsTable = Table.fromTableName(dataStack, 'TeamsTable', 'yalla-teams');
const usersTable = Table.fromTableName(dataStack, 'UsersTable', 'yalla-users');
const visitTypesTable = Table.fromTableName(
  dataStack,
  'VisitTypesTable',
  'yalla-visit_types',
);
const visitTemplatesTable = Table.fromTableName(
  dataStack,
  'VisitTemplatesTable',
  'yalla-visit-templates',
);
const inventoryBucket = Bucket.fromBucketName(
  dataStack,
  'InventoryExportBucket',
  'yalla-s3storage',
);

inventoryTable.grantReadData(backend.getInventory.resources.lambda);
inventoryTable.grantWriteData(backend.upsertInventory.resources.lambda);
inventoryTable.grantWriteData(backend.deleteInventory.resources.lambda);
inventoryTable.grantReadData(backend.getInventoryRebuy.resources.lambda);
inventoryTable.grantReadData(backend.exportInventory.resources.lambda);
inventoryTable.grantReadWriteData(backend.upsertPurchase.resources.lambda);
alarmsTable.grantReadWriteData(backend.getAlerts.resources.lambda);
alarmsTable.grantWriteData(backend.updateAlertStatus.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertAlert.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertInventory.resources.lambda);
purchasesTable.grantReadData(backend.getPurchases.resources.lambda);
purchasesTable.grantReadWriteData(backend.upsertPurchase.resources.lambda);
propertiesTable.grantReadData(backend.getProperties.resources.lambda);
propertiesTable.grantWriteData(backend.upsertProperty.resources.lambda);
propertiesTable.grantWriteData(backend.deleteProperty.resources.lambda);
bookingsTable.grantReadData(backend.getBookings.resources.lambda);
reviewsTable.grantReadData(backend.getReviews.resources.lambda);
reviewsTable.grantWriteData(backend.updateReviewWorkflow.resources.lambda);
reviewSyncStateTable.grantReadData(backend.getReviewsSyncState.resources.lambda);
visitsTable.grantReadWriteData(backend.getVisits.resources.lambda);
visitsTable.grantReadWriteData(backend.upsertVisit.resources.lambda);
visitsTable.grantReadData(backend.upsertTask.resources.lambda);
tasksTable.grantReadWriteData(backend.getVisits.resources.lambda);
tasksTable.grantReadWriteData(backend.getTasks.resources.lambda);
tasksTable.grantReadWriteData(backend.upsertVisit.resources.lambda);
tasksTable.grantReadWriteData(backend.upsertTask.resources.lambda);
teamsTable.grantReadData(backend.getTeams.resources.lambda);
usersTable.grantReadData(backend.getUsers.resources.lambda);
visitTypesTable.grantReadData(backend.getVisitTypes.resources.lambda);
visitTypesTable.grantReadWriteData(backend.upsertVisitType.resources.lambda);
visitTemplatesTable.grantReadWriteData(backend.getVisitTemplates.resources.lambda);
visitTemplatesTable.grantReadWriteData(
  backend.upsertVisitTemplate.resources.lambda,
);
inventoryBucket.grantPut(backend.exportInventory.resources.lambda);

const getInventoryUrl = backend.getInventory.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertInventoryUrl = backend.upsertInventory.resources.lambda.addFunctionUrl(
  {
    authType: FunctionUrlAuthType.NONE,
  },
);
const deleteInventoryUrl = backend.deleteInventory.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
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
const getPurchasesUrl = backend.getPurchases.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertPurchaseUrl = backend.upsertPurchase.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getPropertiesUrl = backend.getProperties.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertPropertyUrl = backend.upsertProperty.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const deletePropertyUrl = backend.deleteProperty.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getBookingsUrl = backend.getBookings.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getReviewsUrl = backend.getReviews.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getReviewsSyncStateUrl =
  backend.getReviewsSyncState.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const updateReviewWorkflowUrl =
  backend.updateReviewWorkflow.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getVisitsUrl = backend.getVisits.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertVisitUrl = backend.upsertVisit.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getTasksUrl = backend.getTasks.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertTaskUrl = backend.upsertTask.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getTeamsUrl = backend.getTeams.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getUsersUrl = backend.getUsers.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getVisitTypesUrl = backend.getVisitTypes.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getVisitTemplatesUrl =
  backend.getVisitTemplates.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertVisitTemplateUrl =
  backend.upsertVisitTemplate.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertVisitTypeUrl = backend.upsertVisitType.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({
  custom: {
    getInventoryUrl: getInventoryUrl.url,
    upsertInventoryUrl: upsertInventoryUrl.url,
    deleteInventoryUrl: deleteInventoryUrl.url,
    getAlertsUrl: getAlertsUrl.url,
    updateAlertStatusUrl: updateAlertStatusUrl.url,
    upsertAlertUrl: upsertAlertUrl.url,
    exportInventoryUrl: exportInventoryUrl.url,
    getPurchasesUrl: getPurchasesUrl.url,
    upsertPurchaseUrl: upsertPurchaseUrl.url,
    getPropertiesUrl: getPropertiesUrl.url,
    upsertPropertyUrl: upsertPropertyUrl.url,
    deletePropertyUrl: deletePropertyUrl.url,
    getBookingsUrl: getBookingsUrl.url,
    getReviewsUrl: getReviewsUrl.url,
    getReviewsSyncStateUrl: getReviewsSyncStateUrl.url,
    updateReviewWorkflowUrl: updateReviewWorkflowUrl.url,
    getVisitsUrl: getVisitsUrl.url,
    upsertVisitUrl: upsertVisitUrl.url,
    getTasksUrl: getTasksUrl.url,
    upsertTaskUrl: upsertTaskUrl.url,
    getTeamsUrl: getTeamsUrl.url,
    getUsersUrl: getUsersUrl.url,
    getVisitTypesUrl: getVisitTypesUrl.url,
    getVisitTemplatesUrl: getVisitTemplatesUrl.url,
    upsertVisitTemplateUrl: upsertVisitTemplateUrl.url,
    upsertVisitTypeUrl: upsertVisitTypeUrl.url,
  },
});
