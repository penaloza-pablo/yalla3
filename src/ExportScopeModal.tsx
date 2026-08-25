import { useTranslation } from 'react-i18next'

type ExportScope = 'filtered' | 'all'

type Props = {
  isOpen: boolean
  isExporting: boolean
  onClose: () => void
  onSelect: (scope: ExportScope) => void
}

export function ExportScopeModal({
  isOpen,
  isExporting,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation()

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal export-scope-modal">
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{t('common.exportScopeTitle')}</h3>
            <p className="modal-subtitle">{t('common.exportScopeSubtitle')}</p>
          </div>
          <button
            className="btn-icon"
            type="button"
            onClick={onClose}
            disabled={isExporting}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="export-scope-actions">
            <button
              className="btn-primary"
              type="button"
              disabled={isExporting}
              onClick={() => onSelect('filtered')}
            >
              {t('common.exportFiltered')}
            </button>
            <button
              className="btn-secondary"
              type="button"
              disabled={isExporting}
              onClick={() => onSelect('all')}
            >
              {t('common.exportAll')}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn-ghost"
            type="button"
            onClick={onClose}
            disabled={isExporting}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
