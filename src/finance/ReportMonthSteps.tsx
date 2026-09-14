import { useTranslation } from 'react-i18next'
import {
  REPORT_WORKFLOW_STATUSES,
  type PropertyReportStatus,
} from '../../amplify/functions/shared/property-report-status'

const STEP_I18N: Record<PropertyReportStatus, string> = {
  IN_PROGRESS: 'propertyReports.statusInProgress',
  READY_TO_CLOSE: 'propertyReports.statusReady',
  READY_TO_PUBLISH: 'propertyReports.statusReadyToPublish',
  PUBLISHED: 'propertyReports.statusPublished',
}

type Props = {
  status: PropertyReportStatus
}

export function ReportMonthSteps({ status }: Props) {
  const { t } = useTranslation()
  const currentIndex = Math.max(0, REPORT_WORKFLOW_STATUSES.indexOf(status))

  return (
    <ol className="report-step-indicator" aria-label={t('propertyReports.status')}>
      {REPORT_WORKFLOW_STATUSES.map((step, index) => {
        const state =
          index < currentIndex
            ? 'is-done'
            : index === currentIndex
              ? 'is-current'
              : 'is-todo'
        return (
          <li key={step} className={`report-step ${state}`}>
            {index > 0 ? <span className="report-step-line" aria-hidden="true" /> : null}
            <span className="report-step-index" aria-hidden="true">
              {index < currentIndex ? '✓' : index + 1}
            </span>
            <span className="report-step-label">{t(STEP_I18N[step])}</span>
          </li>
        )
      })}
    </ol>
  )
}
