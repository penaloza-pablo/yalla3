import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { applyVisitTemplateAutoAssign } from '../amplify/functions/shared/visit-template-auto-assign'
import { getTaskCountsForVisit } from '../amplify/functions/shared/visit-task-utils'

process.env.AWS_REGION ||= 'eu-central-1'
process.env.TABLE_NAME ||= 'yalla-visits'
process.env.VISITS_TABLE ||= 'yalla-visits'
process.env.TASKS_TABLE ||= 'yalla-tasks'
process.env.TEMPLATES_TABLE ||= 'yalla-visit-templates'
process.env.AUTO_ASSIGN_TABLE ||= 'yalla-visit-template-auto-assign'

const FROM_DATE = '2026-09-14'
const dryRun = process.argv.includes('--dry-run')
const fromArg =
  process.argv.find((arg) => arg.startsWith('--from='))?.slice(7) ?? FROM_DATE

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION }),
)

const visitSummary = (visit: Record<string, unknown>) => ({
  id: typeof visit.id === 'string' ? visit.id : '',
  title: typeof visit.title === 'string' ? visit.title : '',
  propertyId: typeof visit.propertyId === 'string' ? visit.propertyId : '',
  scheduledDate:
    typeof visit.scheduledDate === 'string' ? visit.scheduledDate : '',
  status: typeof visit.status === 'string' ? visit.status : '',
  autoAssignedTemplateId:
    typeof visit.autoAssignedTemplateId === 'string'
      ? visit.autoAssignedTemplateId
      : '',
})

const scanVisitsFrom = async (fromDate: string) => {
  const items: Record<string, unknown>[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined
  do {
    const result = await doc.send(
      new ScanCommand({
        TableName: process.env.TABLE_NAME,
        FilterExpression: 'scheduledDate >= :from',
        ExpressionAttributeValues: { ':from': fromDate },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    )
    items.push(...((result.Items as Record<string, unknown>[]) ?? []))
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined
  } while (lastEvaluatedKey)
  return items.sort((left, right) => {
    const dateA = typeof left.scheduledDate === 'string' ? left.scheduledDate : ''
    const dateB = typeof right.scheduledDate === 'string' ? right.scheduledDate : ''
    return dateA.localeCompare(dateB)
  })
}

const visits = await scanVisitsFrom(fromArg)
const assigned: Array<
  ReturnType<typeof visitSummary> & {
    reason: string
    templateId?: string
    ruleId?: string
    createdTasks: number
  }
> = []
const alreadyHasTasks: ReturnType<typeof visitSummary>[] = []
const skipped: Array<
  ReturnType<typeof visitSummary> & { reason: string }
> = []
const tasksTable = process.env.TASKS_TABLE || 'yalla-tasks'

for (const visit of visits) {
  const visitId = typeof visit.id === 'string' ? visit.id.trim() : ''
  const summary = visitSummary(visit)
  if (!visitId) {
    skipped.push({ ...summary, reason: 'missing-fields' })
    continue
  }
  const { total } = await getTaskCountsForVisit(tasksTable, visitId)
  if (total > 0) {
    alreadyHasTasks.push(summary)
    continue
  }
  const result = await applyVisitTemplateAutoAssign(visit, {
    ignoreExistingTemplateId: true,
    dryRun,
  })
  if (result.applied || result.reason === 'would-apply') {
    assigned.push({
      ...visitSummary(result.item),
      reason: result.reason,
      templateId: result.templateId,
      ruleId: result.ruleId,
      createdTasks: result.createdTasks.length,
    })
    continue
  }
  skipped.push({ ...visitSummary(result.item), reason: result.reason })
}

console.log(
  JSON.stringify(
    {
      dryRun,
      from: fromArg,
      visitCount: visits.length,
      assignedCount: assigned.length,
      alreadyHasTasksCount: alreadyHasTasks.length,
      skippedCount: skipped.length,
      assigned,
      alreadyHasTasks,
      skipped,
    },
    null,
    2,
  ),
)
