import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Function as LambdaFunction, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
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
import { exportSubtractions } from './functions/export-subtractions/resource';
import { getPurchases } from './functions/get-purchases/resource';
import { upsertPurchase } from './functions/upsert-purchase/resource';
import { getSubtractions } from './functions/get-subtractions/resource';
import { upsertSubtraction } from './functions/upsert-subtraction/resource';
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
import { proxyGuestyListings } from './functions/proxy-guesty-listings/resource';
import { proxyGuestyReviewsSync } from './functions/proxy-guesty-reviews-sync/resource';
import { proxyGuestyBookingsSync } from './functions/proxy-guesty-bookings-sync/resource';
import { getActivityLogs } from './functions/get-activity-logs/resource';
import { getSpotChecks } from './functions/get-spot-checks/resource';
import { completeSpotCheck } from './functions/complete-spot-check/resource';
import { getCleaners } from './functions/get-cleaners/resource';
import { upsertCleaner } from './functions/upsert-cleaner/resource';
import { getCleaningPlan } from './functions/get-cleaning-plan/resource';
import { upsertCleaningPlan } from './functions/upsert-cleaning-plan/resource';
import { getPropertyCleaningDetails } from './functions/get-property-cleaning-details/resource';
import { upsertPropertyCleaningDetails } from './functions/upsert-property-cleaning-details/resource';

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
  exportSubtractions,
  getPurchases,
  upsertPurchase,
  getSubtractions,
  upsertSubtraction,
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
  proxyGuestyListings,
  proxyGuestyReviewsSync,
  proxyGuestyBookingsSync,
  getActivityLogs,
  getSpotChecks,
  completeSpotCheck,
  getCleaners,
  upsertCleaner,
  getCleaningPlan,
  upsertCleaningPlan,
  getPropertyCleaningDetails,
  upsertPropertyCleaningDetails,
});

const userPoolId = backend.auth.resources.userPool.userPoolId;
const userPoolClientId = backend.auth.resources.userPoolClient.userPoolClientId;
const lambdaFunctionsWithHttp = [
  backend.getInventory,
  backend.upsertInventory,
  backend.deleteInventory,
  backend.getAlerts,
  backend.updateAlertStatus,
  backend.upsertAlert,
  backend.exportInventory,
  backend.exportSubtractions,
  backend.getPurchases,
  backend.upsertPurchase,
  backend.getSubtractions,
  backend.upsertSubtraction,
  backend.getProperties,
  backend.upsertProperty,
  backend.deleteProperty,
  backend.getBookings,
  backend.getReviews,
  backend.getReviewsSyncState,
  backend.updateReviewWorkflow,
  backend.getVisits,
  backend.upsertVisit,
  backend.getTasks,
  backend.upsertTask,
  backend.getTeams,
  backend.getUsers,
  backend.getVisitTypes,
  backend.getVisitTemplates,
  backend.upsertVisitTemplate,
  backend.upsertVisitType,
  backend.proxyGuestyListings,
  backend.proxyGuestyReviewsSync,
  backend.proxyGuestyBookingsSync,
  backend.getActivityLogs,
  backend.getSpotChecks,
  backend.completeSpotCheck,
  backend.getCleaners,
  backend.upsertCleaner,
  backend.getCleaningPlan,
  backend.upsertCleaningPlan,
  backend.getPropertyCleaningDetails,
  backend.upsertPropertyCleaningDetails,
];

for (const lambdaFunction of lambdaFunctionsWithHttp) {
  lambdaFunction.addEnvironment('USER_POOL_ID', userPoolId);
  lambdaFunction.addEnvironment('USER_POOL_CLIENT_ID', userPoolClientId);
}

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
const substractionsTable = Table.fromTableName(
  dataStack,
  'SubstractionsTable',
  'yalla-substractions',
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

const activityLogsTable = new Table(dataStack, 'ActivityLogsTable', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
activityLogsTable.addGlobalSecondaryIndex({
  indexName: 'feature-sk-index',
  partitionKey: { name: 'feature', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});
activityLogsTable.addGlobalSecondaryIndex({
  indexName: 'userEmail-sk-index',
  partitionKey: { name: 'userEmail', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});

inventoryTable.grantReadData(backend.getInventory.resources.lambda);
inventoryTable.grantReadWriteData(backend.upsertInventory.resources.lambda);
inventoryTable.grantReadWriteData(backend.deleteInventory.resources.lambda);
inventoryTable.grantReadData(backend.getInventoryRebuy.resources.lambda);
inventoryTable.grantReadData(backend.exportInventory.resources.lambda);
inventoryTable.grantReadWriteData(backend.upsertPurchase.resources.lambda);
alarmsTable.grantReadWriteData(backend.getAlerts.resources.lambda);
alarmsTable.grantReadWriteData(backend.updateAlertStatus.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertAlert.resources.lambda);
alarmsTable.grantReadWriteData(backend.upsertInventory.resources.lambda);
purchasesTable.grantReadData(backend.getPurchases.resources.lambda);
purchasesTable.grantReadWriteData(backend.upsertPurchase.resources.lambda);
substractionsTable.grantReadData(backend.getSubtractions.resources.lambda);
substractionsTable.grantReadData(backend.exportSubtractions.resources.lambda);
substractionsTable.grantReadWriteData(backend.upsertSubtraction.resources.lambda);
inventoryTable.grantReadWriteData(backend.upsertSubtraction.resources.lambda);
propertiesTable.grantReadData(backend.getProperties.resources.lambda);
propertiesTable.grantReadWriteData(backend.upsertProperty.resources.lambda);
propertiesTable.grantReadWriteData(backend.deleteProperty.resources.lambda);
bookingsTable.grantReadData(backend.getBookings.resources.lambda);
backend.getBookings.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'dynamodb:Query',
      'dynamodb:Scan',
      'dynamodb:GetItem',
      'dynamodb:BatchGetItem',
      'dynamodb:ConditionCheckItem',
      'dynamodb:DescribeTable',
    ],
    resources: [
      bookingsTable.tableArn,
      `${bookingsTable.tableArn}/index/CheckInDate-index`,
    ],
  }),
);
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
inventoryBucket.grantPut(backend.exportSubtractions.resources.lambda);
inventoryBucket.grantPut(backend.completeSpotCheck.resources.lambda);
inventoryTable.grantReadWriteData(backend.completeSpotCheck.resources.lambda);

const activityLogWriters = [
  backend.upsertInventory,
  backend.deleteInventory,
  backend.updateAlertStatus,
  backend.upsertAlert,
  backend.upsertPurchase,
  backend.upsertSubtraction,
  backend.upsertProperty,
  backend.deleteProperty,
  backend.updateReviewWorkflow,
  backend.upsertVisit,
  backend.upsertTask,
  backend.upsertVisitTemplate,
  backend.upsertVisitType,
  backend.proxyGuestyReviewsSync,
  backend.proxyGuestyBookingsSync,
  backend.completeSpotCheck,
  backend.upsertCleaner,
  backend.upsertCleaningPlan,
  backend.upsertPropertyCleaningDetails,
];
for (const lambdaFunction of activityLogWriters) {
  lambdaFunction.addEnvironment('LOGS_TABLE', activityLogsTable.tableName);
  activityLogsTable.grantWriteData(lambdaFunction.resources.lambda);
}
backend.getActivityLogs.addEnvironment('TABLE_NAME', activityLogsTable.tableName);
activityLogsTable.grantReadData(backend.getActivityLogs.resources.lambda);

const spotChecksTable = new Table(dataStack, 'SpotChecksTable', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
spotChecksTable.addGlobalSecondaryIndex({
  indexName: 'locationKey-sk-index',
  partitionKey: { name: 'locationKey', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});
backend.getSpotChecks.addEnvironment('TABLE_NAME', spotChecksTable.tableName);
backend.completeSpotCheck.addEnvironment('TABLE_NAME', spotChecksTable.tableName);
spotChecksTable.grantReadData(backend.getSpotChecks.resources.lambda);
spotChecksTable.grantReadWriteData(backend.completeSpotCheck.resources.lambda);

const cleanersTable = new Table(dataStack, 'CleanersTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
const cleaningPlansTable = new Table(dataStack, 'CleaningPlansTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
const propertyCleaningDetailsTable = new Table(
  dataStack,
  'PropertyCleaningDetailsTable',
  {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  },
);

backend.getCleaners.addEnvironment('TABLE_NAME', cleanersTable.tableName);
backend.upsertCleaner.addEnvironment('TABLE_NAME', cleanersTable.tableName);
backend.getCleaningPlan.addEnvironment('TABLE_NAME', cleaningPlansTable.tableName);
backend.upsertCleaningPlan.addEnvironment(
  'TABLE_NAME',
  cleaningPlansTable.tableName,
);
backend.upsertCleaningPlan.addEnvironment(
  'CLEANERS_TABLE',
  cleanersTable.tableName,
);
backend.getPropertyCleaningDetails.addEnvironment(
  'TABLE_NAME',
  propertyCleaningDetailsTable.tableName,
);
backend.upsertPropertyCleaningDetails.addEnvironment(
  'TABLE_NAME',
  propertyCleaningDetailsTable.tableName,
);
backend.upsertPropertyCleaningDetails.addEnvironment(
  'PROPERTIES_TABLE',
  'yalla-properties',
);
backend.getCleaningPlan.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
backend.upsertCleaningPlan.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);

cleanersTable.grantReadData(backend.getCleaners.resources.lambda);
cleanersTable.grantReadWriteData(backend.upsertCleaner.resources.lambda);
cleanersTable.grantReadData(backend.upsertCleaningPlan.resources.lambda);
cleaningPlansTable.grantReadData(backend.getCleaningPlan.resources.lambda);
cleaningPlansTable.grantReadWriteData(
  backend.upsertCleaningPlan.resources.lambda,
);
propertyCleaningDetailsTable.grantReadData(
  backend.getPropertyCleaningDetails.resources.lambda,
);
propertyCleaningDetailsTable.grantReadWriteData(
  backend.upsertPropertyCleaningDetails.resources.lambda,
);
propertyCleaningDetailsTable.grantReadData(
  backend.getCleaningPlan.resources.lambda,
);
propertyCleaningDetailsTable.grantReadData(
  backend.upsertCleaningPlan.resources.lambda,
);
propertiesTable.grantReadData(
  backend.upsertPropertyCleaningDetails.resources.lambda,
);
visitsTable.grantReadData(backend.getCleaningPlan.resources.lambda);
visitsTable.grantReadWriteData(backend.upsertCleaningPlan.resources.lambda);
const visitsIndexPolicy = new PolicyStatement({
  actions: ['dynamodb:Query', 'dynamodb:Scan'],
  resources: [`${visitsTable.tableArn}/index/*`],
});
backend.getCleaningPlan.resources.lambda.addToRolePolicy(visitsIndexPolicy);
backend.upsertCleaningPlan.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:Query', 'dynamodb:Scan'],
    resources: [`${visitsTable.tableArn}/index/*`],
  }),
);

const syncTaskToGuesty = LambdaFunction.fromFunctionName(
  dataStack,
  'SyncTaskToGuesty',
  'yalla-syncTaskToGuesty',
);
syncTaskToGuesty.grantInvoke(backend.upsertCleaningPlan.resources.lambda);

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
const exportSubtractionsUrl =
  backend.exportSubtractions.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getPurchasesUrl = backend.getPurchases.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertPurchaseUrl = backend.upsertPurchase.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getSubtractionsUrl = backend.getSubtractions.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertSubtractionUrl =
  backend.upsertSubtraction.resources.lambda.addFunctionUrl({
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
const proxyGuestyListingsUrl =
  backend.proxyGuestyListings.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const proxyGuestyReviewsSyncUrl =
  backend.proxyGuestyReviewsSync.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const proxyGuestyBookingsSyncUrl =
  backend.proxyGuestyBookingsSync.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getActivityLogsUrl =
  backend.getActivityLogs.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getSpotChecksUrl = backend.getSpotChecks.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const completeSpotCheckUrl =
  backend.completeSpotCheck.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getCleanersUrl = backend.getCleaners.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertCleanerUrl = backend.upsertCleaner.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getCleaningPlanUrl =
  backend.getCleaningPlan.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertCleaningPlanUrl =
  backend.upsertCleaningPlan.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getPropertyCleaningDetailsUrl =
  backend.getPropertyCleaningDetails.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertPropertyCleaningDetailsUrl =
  backend.upsertPropertyCleaningDetails.resources.lambda.addFunctionUrl({
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
    exportSubtractionsUrl: exportSubtractionsUrl.url,
    getPurchasesUrl: getPurchasesUrl.url,
    upsertPurchaseUrl: upsertPurchaseUrl.url,
    getSubtractionsUrl: getSubtractionsUrl.url,
    upsertSubtractionUrl: upsertSubtractionUrl.url,
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
    proxyGuestyListingsUrl: proxyGuestyListingsUrl.url,
    proxyGuestyReviewsSyncUrl: proxyGuestyReviewsSyncUrl.url,
    proxyGuestyBookingsSyncUrl: proxyGuestyBookingsSyncUrl.url,
    getActivityLogsUrl: getActivityLogsUrl.url,
    getSpotChecksUrl: getSpotChecksUrl.url,
    completeSpotCheckUrl: completeSpotCheckUrl.url,
    getCleanersUrl: getCleanersUrl.url,
    upsertCleanerUrl: upsertCleanerUrl.url,
    getCleaningPlanUrl: getCleaningPlanUrl.url,
    upsertCleaningPlanUrl: upsertCleaningPlanUrl.url,
    getPropertyCleaningDetailsUrl: getPropertyCleaningDetailsUrl.url,
    upsertPropertyCleaningDetailsUrl: upsertPropertyCleaningDetailsUrl.url,
  },
});
