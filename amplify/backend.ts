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
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
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
import { exportCleaningBilling } from './functions/export-cleaning-billing/resource';
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
import { getRoles } from './functions/get-roles/resource';
import { upsertRole } from './functions/upsert-role/resource';
import { getCognitoUsers } from './functions/get-cognito-users/resource';
import { upsertUserRole } from './functions/upsert-user-role/resource';
import { getMyPermissions } from './functions/get-my-permissions/resource';
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
import { getCleaningIncidents } from './functions/get-cleaning-incidents/resource';
import { upsertCleaningIncident } from './functions/upsert-cleaning-incident/resource';
import { getCleaningBilling } from './functions/get-cleaning-billing/resource';
import { upsertCleaningBilling } from './functions/upsert-cleaning-billing/resource';
import { getMaintenanceProviders } from './functions/get-maintenance-providers/resource';
import { upsertMaintenanceProvider } from './functions/upsert-maintenance-provider/resource';
import { getMaintenanceIncidents } from './functions/get-maintenance-incidents/resource';
import { upsertMaintenanceIncident } from './functions/upsert-maintenance-incident/resource';
import { getMaintenanceBillingDetails } from './functions/get-maintenance-billing-details/resource';
import { upsertMaintenanceBillingDetails } from './functions/upsert-maintenance-billing-details/resource';
import { getMaintenanceBilling } from './functions/get-maintenance-billing/resource';
import { upsertMaintenanceBilling } from './functions/upsert-maintenance-billing/resource';
import { exportMaintenanceBilling } from './functions/export-maintenance-billing/resource';
import { getTodaySummary } from './functions/get-today-summary/resource';
import { handleSlackCommand } from './functions/handle-slack-command/resource';
import { processSlackHoy } from './functions/process-slack-hoy/resource';
import { notifyCleaningOverdue } from './functions/notify-cleaning-overdue/resource';

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
  getRoles,
  upsertRole,
  getCognitoUsers,
  upsertUserRole,
  getMyPermissions,
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
  getCleaningIncidents,
  upsertCleaningIncident,
  getCleaningBilling,
  upsertCleaningBilling,
  exportCleaningBilling,
  getMaintenanceProviders,
  upsertMaintenanceProvider,
  getMaintenanceIncidents,
  upsertMaintenanceIncident,
  getMaintenanceBillingDetails,
  upsertMaintenanceBillingDetails,
  getMaintenanceBilling,
  upsertMaintenanceBilling,
  exportMaintenanceBilling,
  getTodaySummary,
  handleSlackCommand,
  processSlackHoy,
  notifyCleaningOverdue,
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
  backend.getRoles,
  backend.upsertRole,
  backend.getCognitoUsers,
  backend.upsertUserRole,
  backend.getMyPermissions,
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
  backend.getCleaningIncidents,
  backend.upsertCleaningIncident,
  backend.getCleaningBilling,
  backend.upsertCleaningBilling,
  backend.exportCleaningBilling,
  backend.getMaintenanceProviders,
  backend.upsertMaintenanceProvider,
  backend.getMaintenanceIncidents,
  backend.upsertMaintenanceIncident,
  backend.getMaintenanceBillingDetails,
  backend.upsertMaintenanceBillingDetails,
  backend.getMaintenanceBilling,
  backend.upsertMaintenanceBilling,
  backend.exportMaintenanceBilling,
  backend.getTodaySummary,
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
inventoryTable.grantReadData(backend.getTodaySummary.resources.lambda);
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
reviewsTable.grantReadData(backend.getTodaySummary.resources.lambda);
reviewsTable.grantWriteData(backend.updateReviewWorkflow.resources.lambda);
reviewSyncStateTable.grantReadData(backend.getReviewsSyncState.resources.lambda);
visitsTable.grantReadWriteData(backend.getVisits.resources.lambda);
visitsTable.grantReadData(backend.getTodaySummary.resources.lambda);
visitsTable.grantReadWriteData(backend.upsertVisit.resources.lambda);
visitsTable.grantReadWriteData(backend.handleSlackCommand.resources.lambda);
visitsTable.grantReadWriteData(backend.notifyCleaningOverdue.resources.lambda);
visitsTable.grantReadData(backend.upsertTask.resources.lambda);
tasksTable.grantReadWriteData(backend.getVisits.resources.lambda);
tasksTable.grantReadWriteData(backend.getTasks.resources.lambda);
tasksTable.grantReadWriteData(backend.upsertVisit.resources.lambda);
tasksTable.grantReadWriteData(backend.upsertTask.resources.lambda);
const tasksIndexPolicy = new PolicyStatement({
  actions: ['dynamodb:Query', 'dynamodb:Scan'],
  resources: [`${tasksTable.tableArn}/index/*`],
});
backend.getVisits.resources.lambda.addToRolePolicy(tasksIndexPolicy);
backend.getTasks.resources.lambda.addToRolePolicy(tasksIndexPolicy);
backend.upsertVisit.resources.lambda.addToRolePolicy(tasksIndexPolicy);
backend.upsertTask.resources.lambda.addToRolePolicy(tasksIndexPolicy);
backend.handleSlackCommand.resources.lambda.addToRolePolicy(tasksIndexPolicy);
backend.getTodaySummary.resources.lambda.addToRolePolicy(tasksIndexPolicy);
tasksTable.grantReadData(backend.handleSlackCommand.resources.lambda);
tasksTable.grantReadData(backend.getTodaySummary.resources.lambda);
teamsTable.grantReadData(backend.getTeams.resources.lambda);
usersTable.grantReadData(backend.getUsers.resources.lambda);

const rbacTable = new Table(dataStack, 'RbacTable', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
const rbacLambdas = [
  backend.getRoles,
  backend.upsertRole,
  backend.getCognitoUsers,
  backend.upsertUserRole,
  backend.getMyPermissions,
];
for (const lambdaFunction of rbacLambdas) {
  lambdaFunction.addEnvironment('TABLE_NAME', rbacTable.tableName);
}
rbacTable.grantReadWriteData(backend.getRoles.resources.lambda);
rbacTable.grantReadWriteData(backend.upsertRole.resources.lambda);
rbacTable.grantReadWriteData(backend.getCognitoUsers.resources.lambda);
rbacTable.grantReadWriteData(backend.upsertUserRole.resources.lambda);
rbacTable.grantReadWriteData(backend.getMyPermissions.resources.lambda);
backend.getCognitoUsers.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:ListUsers'],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);
backend.upsertUserRole.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:ListUsers',
      'cognito-idp:AdminUpdateUserAttributes',
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);
visitTypesTable.grantReadData(backend.getVisitTypes.resources.lambda);
visitTypesTable.grantReadWriteData(backend.upsertVisitType.resources.lambda);
visitTemplatesTable.grantReadWriteData(backend.getVisitTemplates.resources.lambda);
visitTemplatesTable.grantReadWriteData(
  backend.upsertVisitTemplate.resources.lambda,
);
backend.getVisitTemplates.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:Query', 'dynamodb:Scan'],
    resources: [`${visitTemplatesTable.tableArn}/index/*`],
  }),
);
inventoryBucket.grantPut(backend.exportInventory.resources.lambda);
inventoryBucket.grantPut(backend.exportSubtractions.resources.lambda);
inventoryBucket.grantPut(backend.exportCleaningBilling.resources.lambda);
inventoryBucket.grantPut(backend.exportMaintenanceBilling.resources.lambda);
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
  backend.upsertCleaningIncident,
  backend.upsertCleaningBilling,
  backend.upsertMaintenanceProvider,
  backend.upsertMaintenanceIncident,
  backend.upsertMaintenanceBillingDetails,
  backend.upsertMaintenanceBilling,
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
const cleaningIncidentsTable = new Table(dataStack, 'CleaningIncidentsTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
const cleaningBillingTable = new Table(dataStack, 'CleaningBillingTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
cleaningIncidentsTable.addGlobalSecondaryIndex({
  indexName: 'cleanerId-createdAt-index',
  partitionKey: { name: 'cleanerId', type: AttributeType.STRING },
  sortKey: { name: 'createdAtKey', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});

backend.getCleaners.addEnvironment('TABLE_NAME', cleanersTable.tableName);
backend.upsertCleaner.addEnvironment('TABLE_NAME', cleanersTable.tableName);
backend.upsertCleaner.addEnvironment('CLEANERS_TABLE', cleanersTable.tableName);
backend.upsertCleaner.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.upsertCleaner.addEnvironment(
  'CLEANING_INCIDENTS_TABLE',
  cleaningIncidentsTable.tableName,
);
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
backend.getCleaningIncidents.addEnvironment(
  'TABLE_NAME',
  cleaningIncidentsTable.tableName,
);
backend.upsertCleaningIncident.addEnvironment(
  'TABLE_NAME',
  cleaningIncidentsTable.tableName,
);
backend.upsertCleaningIncident.addEnvironment(
  'CLEANING_INCIDENTS_TABLE',
  cleaningIncidentsTable.tableName,
);
backend.upsertCleaningIncident.addEnvironment(
  'CLEANERS_TABLE',
  cleanersTable.tableName,
);
backend.upsertCleaningIncident.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.getCleaningBilling.addEnvironment(
  'TABLE_NAME',
  cleaningBillingTable.tableName,
);
backend.getCleaningBilling.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.getCleaningBilling.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
backend.exportCleaningBilling.addEnvironment(
  'TABLE_NAME',
  cleaningBillingTable.tableName,
);
backend.upsertCleaningBilling.addEnvironment(
  'TABLE_NAME',
  cleaningBillingTable.tableName,
);
backend.upsertCleaningBilling.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.upsertCleaningBilling.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
backend.upsertVisit.addEnvironment('CLEANERS_TABLE', cleanersTable.tableName);
backend.upsertVisit.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.upsertVisit.addEnvironment(
  'CLEANING_INCIDENTS_TABLE',
  cleaningIncidentsTable.tableName,
);
backend.upsertCleaningPlan.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.upsertCleaningPlan.addEnvironment(
  'CLEANING_INCIDENTS_TABLE',
  cleaningIncidentsTable.tableName,
);

cleanersTable.grantReadData(backend.getCleaners.resources.lambda);
cleanersTable.grantReadWriteData(backend.upsertCleaner.resources.lambda);
visitsTable.grantReadData(backend.upsertCleaner.resources.lambda);
cleaningPlansTable.grantReadData(backend.upsertCleaner.resources.lambda);
cleaningIncidentsTable.grantReadData(backend.upsertCleaner.resources.lambda);
backend.upsertCleaner.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: [`${cleaningIncidentsTable.tableArn}/index/*`],
  }),
);
backend.handleSlackCommand.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: [`${cleaningIncidentsTable.tableArn}/index/*`],
  }),
);
cleanersTable.grantReadWriteData(backend.upsertCleaningPlan.resources.lambda);
cleanersTable.grantReadWriteData(backend.upsertVisit.resources.lambda);
cleanersTable.grantReadWriteData(backend.handleSlackCommand.resources.lambda);
cleanersTable.grantReadWriteData(
  backend.upsertCleaningIncident.resources.lambda,
);
cleaningPlansTable.grantReadData(backend.getCleaningPlan.resources.lambda);
cleaningPlansTable.grantReadData(backend.getTodaySummary.resources.lambda);
backend.getTodaySummary.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.getTodaySummary.addEnvironment(
  'CLEANING_BILLING_TABLE',
  cleaningBillingTable.tableName,
);
backend.getTodaySummary.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
const slackSecret = Secret.fromSecretNameV2(
  dataStack,
  'YallaSlackSecret',
  'yalla/slack',
);
slackSecret.grantRead(backend.handleSlackCommand.resources.lambda);
slackSecret.grantRead(backend.notifyCleaningOverdue.resources.lambda);
backend.handleSlackCommand.addEnvironment(
  'CLEANERS_TABLE',
  cleanersTable.tableName,
);
backend.handleSlackCommand.addEnvironment(
  'CLEANING_PLANS_TABLE',
  cleaningPlansTable.tableName,
);
backend.handleSlackCommand.addEnvironment(
  'CLEANING_INCIDENTS_TABLE',
  cleaningIncidentsTable.tableName,
);
backend.handleSlackCommand.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
backend.notifyCleaningOverdue.addEnvironment(
  'PROPERTY_CLEANING_DETAILS_TABLE',
  propertyCleaningDetailsTable.tableName,
);
propertyCleaningDetailsTable.grantReadData(
  backend.handleSlackCommand.resources.lambda,
);
propertyCleaningDetailsTable.grantReadData(
  backend.notifyCleaningOverdue.resources.lambda,
);
cleaningPlansTable.grantReadData(backend.handleSlackCommand.resources.lambda);
cleaningIncidentsTable.grantReadData(
  backend.handleSlackCommand.resources.lambda,
);
backend.processSlackHoy.resources.lambda.grantInvoke(
  backend.handleSlackCommand.resources.lambda,
);
backend.getTodaySummary.resources.lambda.grantInvoke(
  backend.processSlackHoy.resources.lambda,
);
backend.handleSlackCommand.addEnvironment(
  'PROCESS_SLACK_HOY_FUNCTION_NAME',
  backend.processSlackHoy.resources.lambda.functionName,
);
backend.processSlackHoy.addEnvironment(
  'GET_TODAY_SUMMARY_FUNCTION_NAME',
  backend.getTodaySummary.resources.lambda.functionName,
);
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
visitsTable.grantReadData(backend.upsertCleaningIncident.resources.lambda);
propertiesTable.grantReadData(backend.upsertCleaningIncident.resources.lambda);
cleaningPlansTable.grantReadData(
  backend.upsertCleaningIncident.resources.lambda,
);
cleaningPlansTable.grantReadData(backend.upsertVisit.resources.lambda);
cleaningIncidentsTable.grantReadData(
  backend.getCleaningIncidents.resources.lambda,
);
cleaningIncidentsTable.grantReadWriteData(
  backend.upsertCleaningIncident.resources.lambda,
);
cleaningIncidentsTable.grantReadData(backend.upsertVisit.resources.lambda);
cleaningIncidentsTable.grantReadData(
  backend.upsertCleaningPlan.resources.lambda,
);
cleaningBillingTable.grantReadData(backend.getCleaningBilling.resources.lambda);
cleaningBillingTable.grantReadData(
  backend.exportCleaningBilling.resources.lambda,
);
cleaningBillingTable.grantReadData(backend.getTodaySummary.resources.lambda);
propertyCleaningDetailsTable.grantReadData(
  backend.getTodaySummary.resources.lambda,
);
cleaningBillingTable.grantReadWriteData(
  backend.upsertCleaningBilling.resources.lambda,
);
cleaningBillingTable.grantReadWriteData(
  backend.getCleaningBilling.resources.lambda,
);
visitsTable.grantReadData(backend.getCleaningBilling.resources.lambda);
visitsTable.grantReadData(backend.upsertCleaningBilling.resources.lambda);
cleaningPlansTable.grantReadData(backend.getCleaningBilling.resources.lambda);
cleaningPlansTable.grantReadData(backend.upsertCleaningBilling.resources.lambda);
propertyCleaningDetailsTable.grantReadData(
  backend.getCleaningBilling.resources.lambda,
);
propertyCleaningDetailsTable.grantReadData(
  backend.upsertCleaningBilling.resources.lambda,
);
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
backend.getCleaningBilling.resources.lambda.addToRolePolicy(visitsIndexPolicy);
backend.upsertCleaningBilling.resources.lambda.addToRolePolicy(visitsIndexPolicy);
backend.getTodaySummary.resources.lambda.addToRolePolicy(visitsIndexPolicy);
backend.notifyCleaningOverdue.resources.lambda.addToRolePolicy(visitsIndexPolicy);

const maintenanceProvidersTable = new Table(
  dataStack,
  'MaintenanceProvidersTable',
  {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  },
);
const maintenanceIncidentsTable = new Table(
  dataStack,
  'MaintenanceIncidentsTable',
  {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  },
);
const maintenanceBillingDetailsTable = new Table(
  dataStack,
  'MaintenanceBillingDetailsTable',
  {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  },
);
const maintenanceBillingTable = new Table(dataStack, 'MaintenanceBillingTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});
maintenanceIncidentsTable.addGlobalSecondaryIndex({
  indexName: 'providerId-createdAt-index',
  partitionKey: { name: 'providerId', type: AttributeType.STRING },
  sortKey: { name: 'createdAtKey', type: AttributeType.STRING },
  projectionType: ProjectionType.ALL,
});

backend.getMaintenanceProviders.addEnvironment(
  'TABLE_NAME',
  maintenanceProvidersTable.tableName,
);
backend.getMaintenanceProviders.addEnvironment(
  'INCIDENTS_TABLE',
  maintenanceIncidentsTable.tableName,
);
backend.getMaintenanceProviders.addEnvironment(
  'BILLING_TABLE',
  maintenanceBillingTable.tableName,
);
backend.getMaintenanceProviders.addEnvironment(
  'SETTINGS_TABLE',
  maintenanceBillingDetailsTable.tableName,
);
backend.getMaintenanceProviders.addEnvironment('VISITS_TABLE', 'yalla-visits');
backend.getMaintenanceProviders.addEnvironment(
  'VISIT_TYPES_TABLE',
  'yalla-visit_types',
);
backend.getMaintenanceProviders.addEnvironment(
  'PROPERTIES_TABLE',
  'yalla-properties',
);
backend.upsertMaintenanceProvider.addEnvironment(
  'TABLE_NAME',
  maintenanceProvidersTable.tableName,
);
backend.getMaintenanceIncidents.addEnvironment(
  'TABLE_NAME',
  maintenanceIncidentsTable.tableName,
);
backend.upsertMaintenanceIncident.addEnvironment(
  'TABLE_NAME',
  maintenanceIncidentsTable.tableName,
);
backend.upsertMaintenanceIncident.addEnvironment(
  'PROVIDERS_TABLE',
  maintenanceProvidersTable.tableName,
);
backend.getMaintenanceBillingDetails.addEnvironment(
  'TABLE_NAME',
  maintenanceBillingDetailsTable.tableName,
);
backend.getMaintenanceBillingDetails.addEnvironment(
  'PROVIDERS_TABLE',
  maintenanceProvidersTable.tableName,
);
backend.upsertMaintenanceBillingDetails.addEnvironment(
  'TABLE_NAME',
  maintenanceBillingDetailsTable.tableName,
);
backend.upsertMaintenanceBillingDetails.addEnvironment(
  'PROVIDERS_TABLE',
  maintenanceProvidersTable.tableName,
);
backend.getMaintenanceBilling.addEnvironment(
  'TABLE_NAME',
  maintenanceBillingTable.tableName,
);
backend.getMaintenanceBilling.addEnvironment(
  'SETTINGS_TABLE',
  maintenanceBillingDetailsTable.tableName,
);
backend.getMaintenanceBilling.addEnvironment(
  'PROVIDERS_TABLE',
  maintenanceProvidersTable.tableName,
);
backend.upsertMaintenanceBilling.addEnvironment(
  'TABLE_NAME',
  maintenanceBillingTable.tableName,
);
backend.upsertMaintenanceBilling.addEnvironment(
  'SETTINGS_TABLE',
  maintenanceBillingDetailsTable.tableName,
);
backend.upsertMaintenanceBilling.addEnvironment(
  'PROVIDERS_TABLE',
  maintenanceProvidersTable.tableName,
);
backend.exportMaintenanceBilling.addEnvironment(
  'TABLE_NAME',
  maintenanceBillingTable.tableName,
);

maintenanceProvidersTable.grantReadWriteData(
  backend.getMaintenanceProviders.resources.lambda,
);
maintenanceProvidersTable.grantReadWriteData(
  backend.upsertMaintenanceProvider.resources.lambda,
);
maintenanceProvidersTable.grantReadWriteData(
  backend.getMaintenanceBillingDetails.resources.lambda,
);
maintenanceProvidersTable.grantReadWriteData(
  backend.upsertMaintenanceBillingDetails.resources.lambda,
);
maintenanceProvidersTable.grantReadWriteData(
  backend.getMaintenanceBilling.resources.lambda,
);
maintenanceProvidersTable.grantReadWriteData(
  backend.upsertMaintenanceBilling.resources.lambda,
);
maintenanceProvidersTable.grantReadData(
  backend.upsertMaintenanceIncident.resources.lambda,
);
maintenanceIncidentsTable.grantReadData(
  backend.getMaintenanceIncidents.resources.lambda,
);
maintenanceIncidentsTable.grantReadWriteData(
  backend.upsertMaintenanceIncident.resources.lambda,
);
maintenanceIncidentsTable.grantReadData(
  backend.getMaintenanceProviders.resources.lambda,
);
backend.getMaintenanceProviders.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: [`${maintenanceIncidentsTable.tableArn}/index/*`],
  }),
);
maintenanceBillingDetailsTable.grantReadWriteData(
  backend.getMaintenanceBillingDetails.resources.lambda,
);
maintenanceBillingDetailsTable.grantReadWriteData(
  backend.upsertMaintenanceBillingDetails.resources.lambda,
);
maintenanceBillingDetailsTable.grantReadWriteData(
  backend.getMaintenanceBilling.resources.lambda,
);
maintenanceBillingDetailsTable.grantReadWriteData(
  backend.upsertMaintenanceBilling.resources.lambda,
);
maintenanceBillingDetailsTable.grantReadWriteData(
  backend.getMaintenanceProviders.resources.lambda,
);
maintenanceBillingTable.grantReadWriteData(
  backend.getMaintenanceBilling.resources.lambda,
);
maintenanceBillingTable.grantReadWriteData(
  backend.upsertMaintenanceBilling.resources.lambda,
);
maintenanceBillingTable.grantReadData(
  backend.exportMaintenanceBilling.resources.lambda,
);
maintenanceBillingTable.grantReadData(
  backend.getMaintenanceProviders.resources.lambda,
);
visitsTable.grantReadData(backend.getMaintenanceProviders.resources.lambda);
visitsTable.grantReadData(backend.upsertMaintenanceIncident.resources.lambda);
visitsTable.grantReadData(backend.getMaintenanceBilling.resources.lambda);
visitsTable.grantReadData(backend.upsertMaintenanceBilling.resources.lambda);
propertiesTable.grantReadData(backend.upsertMaintenanceIncident.resources.lambda);
propertiesTable.grantReadData(backend.getMaintenanceBilling.resources.lambda);
propertiesTable.grantReadData(backend.upsertMaintenanceBilling.resources.lambda);
propertiesTable.grantReadData(backend.getMaintenanceProviders.resources.lambda);
visitTypesTable.grantReadData(
  backend.getMaintenanceBillingDetails.resources.lambda,
);
visitTypesTable.grantReadData(
  backend.upsertMaintenanceBillingDetails.resources.lambda,
);
visitTypesTable.grantReadData(backend.getMaintenanceBilling.resources.lambda);
visitTypesTable.grantReadData(backend.upsertMaintenanceBilling.resources.lambda);
visitTypesTable.grantReadData(backend.getMaintenanceProviders.resources.lambda);
backend.getMaintenanceProviders.resources.lambda.addToRolePolicy(
  visitsIndexPolicy,
);
backend.getMaintenanceBilling.resources.lambda.addToRolePolicy(visitsIndexPolicy);
backend.upsertMaintenanceBilling.resources.lambda.addToRolePolicy(
  visitsIndexPolicy,
);

const syncTaskToGuesty = LambdaFunction.fromFunctionName(
  dataStack,
  'SyncTaskToGuesty',
  'yalla-syncTaskToGuesty',
);
syncTaskToGuesty.grantInvoke(backend.upsertCleaningPlan.resources.lambda);
syncTaskToGuesty.grantInvoke(backend.upsertVisit.resources.lambda);
syncTaskToGuesty.grantInvoke(backend.upsertTask.resources.lambda);

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
const getRolesUrl = backend.getRoles.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const upsertRoleUrl = backend.upsertRole.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getCognitoUsersUrl =
  backend.getCognitoUsers.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertUserRoleUrl = backend.upsertUserRole.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const getMyPermissionsUrl =
  backend.getMyPermissions.resources.lambda.addFunctionUrl({
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
const getCleaningIncidentsUrl =
  backend.getCleaningIncidents.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertCleaningIncidentUrl =
  backend.upsertCleaningIncident.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getCleaningBillingUrl =
  backend.getCleaningBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertCleaningBillingUrl =
  backend.upsertCleaningBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const exportCleaningBillingUrl =
  backend.exportCleaningBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getMaintenanceProvidersUrl =
  backend.getMaintenanceProviders.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertMaintenanceProviderUrl =
  backend.upsertMaintenanceProvider.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getMaintenanceIncidentsUrl =
  backend.getMaintenanceIncidents.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertMaintenanceIncidentUrl =
  backend.upsertMaintenanceIncident.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getMaintenanceBillingDetailsUrl =
  backend.getMaintenanceBillingDetails.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertMaintenanceBillingDetailsUrl =
  backend.upsertMaintenanceBillingDetails.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getMaintenanceBillingUrl =
  backend.getMaintenanceBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const upsertMaintenanceBillingUrl =
  backend.upsertMaintenanceBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const exportMaintenanceBillingUrl =
  backend.exportMaintenanceBilling.resources.lambda.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
  });
const getTodaySummaryUrl = backend.getTodaySummary.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
const handleSlackCommandUrl =
  backend.handleSlackCommand.resources.lambda.addFunctionUrl({
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
    getRolesUrl: getRolesUrl.url,
    upsertRoleUrl: upsertRoleUrl.url,
    getCognitoUsersUrl: getCognitoUsersUrl.url,
    upsertUserRoleUrl: upsertUserRoleUrl.url,
    getMyPermissionsUrl: getMyPermissionsUrl.url,
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
    getCleaningIncidentsUrl: getCleaningIncidentsUrl.url,
    upsertCleaningIncidentUrl: upsertCleaningIncidentUrl.url,
    getCleaningBillingUrl: getCleaningBillingUrl.url,
    upsertCleaningBillingUrl: upsertCleaningBillingUrl.url,
    exportCleaningBillingUrl: exportCleaningBillingUrl.url,
    getMaintenanceProvidersUrl: getMaintenanceProvidersUrl.url,
    upsertMaintenanceProviderUrl: upsertMaintenanceProviderUrl.url,
    getMaintenanceIncidentsUrl: getMaintenanceIncidentsUrl.url,
    upsertMaintenanceIncidentUrl: upsertMaintenanceIncidentUrl.url,
    getMaintenanceBillingDetailsUrl: getMaintenanceBillingDetailsUrl.url,
    upsertMaintenanceBillingDetailsUrl: upsertMaintenanceBillingDetailsUrl.url,
    getMaintenanceBillingUrl: getMaintenanceBillingUrl.url,
    upsertMaintenanceBillingUrl: upsertMaintenanceBillingUrl.url,
    exportMaintenanceBillingUrl: exportMaintenanceBillingUrl.url,
    getTodaySummaryUrl: getTodaySummaryUrl.url,
    handleSlackCommandUrl: handleSlackCommandUrl.url,
  },
});
