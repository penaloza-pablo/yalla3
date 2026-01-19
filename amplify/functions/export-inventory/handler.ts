import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
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
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
};

const buildXlsxBuffer = (items: Record<string, unknown>[]) => {
  const columns = [
    { key: 'id', label: 'id' },
    { key: 'Item name', label: 'Item name' },
    { key: 'category', label: 'category' },
    { key: 'Location', label: 'Location' },
    { key: 'Status', label: 'Status' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Last updated', label: 'Last updated' },
    { key: 'rebuyQty', label: 'rebuyQty' },
    { key: 'unitPrice', label: 'unitPrice' },
    { key: 'Tolerance', label: 'Tolerance' },
    { key: 'consumptionRules', label: 'consumptionRules' },
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
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

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

  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;
  const prefix = process.env.BUCKET_PREFIX ?? 'inventory/';

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
    const fileName = `inventory-export-${timestamp}.xlsx`;
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
    console.error('ExportInventory failed', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to export inventory.' }),
    };
  }
};
