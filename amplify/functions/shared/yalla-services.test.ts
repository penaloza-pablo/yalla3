import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_KEYS,
  PERMISSIONS_CATALOG_VERSION,
  allPermissionKeys,
  applyPermissionCatalog,
  pagePermission,
} from './rbac-catalog';
import {
  classifyDynamoTableHealth,
  classifyFunctionConfiguration,
  classifyGuestyOpenApiHealth,
  classifyLambdaBootHealth,
  classifyLambdaWebhookHealth,
} from './yalla-services-checks';
import {
  YALLA_SERVICE_IDS,
  YALLA_SERVICES,
  appendServiceRun,
  diagnoseSlotFromMadridTime,
  emptyHealth,
  mapServiceHealth,
  monitoredYallaServices,
} from './yalla-services';

test('catalog v11 adds Yalla Services for Administración roles', () => {
  assert.equal(PERMISSIONS_CATALOG_VERSION, 11);
  const key = pagePermission('Yalla Services');
  assert.equal(
    applyPermissionCatalog([pagePermission('Slack')], 10).includes(key),
    true,
  );
  assert.equal(
    applyPermissionCatalog([pagePermission('Logs')], 10).includes(key),
    true,
  );
  assert.equal(
    applyPermissionCatalog([pagePermission('Daily Operations')], 10).includes(
      key,
    ),
    false,
  );
  assert.equal(
    applyPermissionCatalog([pagePermission('Slack'), key], 11).includes(key),
    true,
  );
  assert.equal(
    applyPermissionCatalog([pagePermission('Slack')], 11).includes(key),
    false,
  );
  assert.equal(allPermissionKeys().includes(key), true);
  assert.equal(allPermissionKeys().includes(ACTION_KEYS.dailyOpsAgendaResize), true);
});

test('approved critical services are all monitored', () => {
  assert.deepEqual(
    monitoredYallaServices().map((service) => service.id),
    [
      YALLA_SERVICE_IDS.guestyBookingsReceiver,
      YALLA_SERVICE_IDS.guestyOpenApi,
      YALLA_SERVICE_IDS.guestyTasksReceiver,
      YALLA_SERVICE_IDS.yallaSyncTaskToGuesty,
      YALLA_SERVICE_IDS.slackBot,
      YALLA_SERVICE_IDS.checkInAccessCron,
      YALLA_SERVICE_IDS.akilesLockEvents,
      YALLA_SERVICE_IDS.dynamodbOpsTables,
    ],
  );
  assert.equal(
    YALLA_SERVICES.every((service) => service.mode === 'monitored'),
    true,
  );
});

test('webhook probe treats missing-module init as down', () => {
  const result = classifyLambdaWebhookHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    functionError: 'Unhandled',
    bodyText:
      'Cannot find module \'/var/shared/vikey-access.mjs\' imported from /var/task/index.mjs',
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /does not start/i);
});

test('webhook probe treats empty POST 400 as healthy', () => {
  const result = classifyLambdaWebhookHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    statusCode: 400,
    bodyText: '{"error":"Missing ReservationID"}',
  });
  assert.equal(result.ok, true);
});

test('webhook probe treats 401 as healthy when the secret is required', () => {
  const result = classifyLambdaWebhookHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    statusCode: 401,
    bodyText: '{"error":"Unauthorized"}',
  });
  assert.equal(result.ok, true);
});

test('webhook probe treats missing GuestyTaskID and Akiles bad sig as healthy', () => {
  const tasks = classifyLambdaWebhookHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    statusCode: 400,
    bodyText: '{"error":"Missing GuestyTaskID"}',
  });
  assert.equal(tasks.ok, true);
  const akiles = classifyLambdaWebhookHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    statusCode: 400,
    bodyText: '{"message":"bad sig"}',
  });
  assert.equal(akiles.ok, true);
});

test('boot probe treats missing-module as down and other application errors as up', () => {
  const init = classifyLambdaBootHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    functionError: 'Unhandled',
    bodyText: 'Cannot find module \'/var/task/index.mjs\'',
  });
  assert.equal(init.ok, false);
  const appError = classifyLambdaBootHealth({
    state: 'Active',
    lastUpdateStatus: 'Successful',
    functionError: 'Unhandled',
    bodyText: '{"error":"id is required"}',
  });
  assert.equal(appError.ok, true);
});

test('function configuration requires Active and Successful update', () => {
  assert.equal(
    classifyFunctionConfiguration({ state: 'Failed', lastUpdateStatus: 'Successful' })
      .ok,
    false,
  );
  assert.equal(
    classifyFunctionConfiguration({ state: 'Active', lastUpdateStatus: 'Successful' })
      .ok,
    true,
  );
});

test('Guesty Open API health requires a live client response', () => {
  assert.equal(classifyGuestyOpenApiHealth({ available: false }).ok, false);
  assert.equal(
    classifyGuestyOpenApiHealth({ available: true, error: '401 Unauthorized' }).ok,
    false,
  );
  assert.equal(
    classifyGuestyOpenApiHealth({ available: true, itemCount: 1 }).ok,
    true,
  );
});

test('DynamoDB ops tables fail when any table is not ACTIVE', () => {
  assert.equal(
    classifyDynamoTableHealth([
      { name: 'yalla-bookings', status: 'ACTIVE' },
      { name: 'yalla-visits', status: 'ACTIVE' },
    ]).ok,
    true,
  );
  assert.equal(
    classifyDynamoTableHealth([
      { name: 'yalla-bookings', status: 'ACTIVE' },
      { name: 'yalla-visits', error: 'ResourceNotFoundException' },
    ]).ok,
    false,
  );
});

test('health history keeps failures and recovers on the next ok run', () => {
  const service = YALLA_SERVICES[0];
  const failed = appendServiceRun(emptyHealth(service), {
    at: '2026-10-08T06:00:00.000Z',
    slot: '08:00',
    status: 'error',
    error: 'Lambda does not start (missing module).',
  });
  assert.equal(failed.status, 'error');
  assert.equal(failed.consecutiveFailures, 1);
  const recovered = appendServiceRun(failed, {
    at: '2026-10-08T12:00:00.000Z',
    slot: '14:00',
    status: 'ok',
  });
  assert.equal(recovered.status, 'ok');
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.lastRuns.length, 2);
});

test('monitored services keep stored health from Dynamo', () => {
  const openApi = YALLA_SERVICES.find(
    (service) => service.id === YALLA_SERVICE_IDS.guestyOpenApi,
  );
  assert.ok(openApi);
  const mapped = mapServiceHealth(openApi, {
    serviceId: openApi.id,
    status: 'ok',
    consecutiveFailures: 0,
  });
  assert.equal(mapped.status, 'ok');
});

test('diagnose slot labels Madrid hours and manual runs', () => {
  assert.equal(diagnoseSlotFromMadridTime('08:01', 'scheduled'), '08:00');
  assert.equal(diagnoseSlotFromMadridTime('14:00', 'scheduled'), '14:00');
  assert.equal(diagnoseSlotFromMadridTime('20:59', 'scheduled'), '20:00');
  assert.equal(diagnoseSlotFromMadridTime('11:00', 'scheduled'), 'scheduled');
  assert.equal(diagnoseSlotFromMadridTime('08:00', 'manual'), 'manual');
});
