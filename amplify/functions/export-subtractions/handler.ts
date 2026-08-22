import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
};

const formatDateStamp = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const toCellValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
};

const buildXlsxBuffer = (items: Record<string, unknown>[]) => {
  const columns = [
    { key: 'id', label: 'id' },
    { key: 'Item id', label: 'Item id' },
    { key: 'Item name', label: 'Item name' },
    { key: 'Inventory location', label: 'Inventory location' },
    { key: 'Property id', label: 'Property id' },
    { key: 'Location', label: 'Location' },
    { key: 'Units', label: 'Units' },
    { key: 'Cost', label: 'Cost' },
    { key: 'Billable', label: 'Billable' },
    { key: 'Markup applied', label: 'Markup applied' },
    { key: 'Markup', label: 'Markup' },
    { key: 'IVA Markup', label: 'IVA Markup' },
    { key: 'Price excl. IVA', label: 'Price excl. IVA' },
    { key: 'IVA', label: 'IVA' },
    { key: 'Total Price', label: 'Total Price' },
    { key: 'Note', label: 'Note' },
    { key: 'Date', label: 'Date' },
    { key: 'Status', label: 'Status' },
  ];

  const data = items.map((item) => {
    const row: Record<string, string | number> = {};
    columns.forEach((column) => {
      row[column.label] = toCellValue(item[column.key]);
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: columns.map((column) => column.label),
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Subtractions');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
}) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (event.requestContext?.http?.method) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;
  const prefix = process.env.BUCKET_PREFIX ?? 'subtractions/';

  if (!tableName || !bucketName) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'TABLE_NAME or BUCKET_NAME is not configured.' }),
    };
  }

  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      items.push(...(result.Items ?? []));
      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);

    const timestamp = formatDateStamp(new Date());
    const fileName = `subtractions-export-${timestamp}.xlsx`;
    const key = `${prefix}${fileName}`;
    const body = buildXlsxBuffer(items);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fileName}"`,
      },
      body: body.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('ExportSubtractions failed', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to export subtractions.' }),
    };
  }
};
