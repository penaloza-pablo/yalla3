import { useTranslation } from 'react-i18next'
import type { VisitTemplateRecord } from './types'

type Props = {
  templates: VisitTemplateRecord[]
  selectedId: string
  onSelectId: (id: string) => void
  onApply: () => void
  disabled?: boolean
  applying?: boolean
}

export function VisitUseTemplateControls({
  templates,
  selectedId,
  onSelectId,
  onApply,
  disabled,
  applying,
}: Props) {
  const { t } = useTranslation()

  if (templates.length === 0) {
    return (
      <p className="operations-use-template-empty">
        {t('operations.noTemplatesForProperty')}
      </p>
    )
  }

  return (
    <div className="operations-use-template">
      <label>
        {t('operations.useTemplate')}
        <select
          value={selectedId}
          onChange={(event) => onSelectId(event.target.value)}
          disabled={disabled || applying}
        >
          <option value="">{t('operations.noTemplate')}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn-secondary"
        disabled={!selectedId || disabled || applying}
        onClick={() => onApply()}
      >
        {applying ? t('operations.applyingTemplate') : t('operations.useTemplate')}
      </button>
    </div>
  )
}
