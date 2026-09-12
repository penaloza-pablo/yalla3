import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ICON_GROUPS, ICON_HAS_FILL, YlIcon, type YlIconName } from '../icons'
import { EmptyState } from '../Feedback'
import { ProgressCard } from '../ProgressCard'
import { SegmentedControl } from '../SegmentedControl'
import { StatCard } from '../StatCard'
import { useToast } from '../Toast'
import { useConfirm } from '../ConfirmDialog'
import { YallaSwitch } from '../../bookings/YallaSwitch'
import { DismissibleNotice } from '../../operations/DismissibleNotice'
import {
  KIT_CATEGORIES,
  KIT_REF_PATTERN,
  isKitCategory,
  readCustomKitElements,
  removeCustomKitElement,
  upsertCustomKitElement,
  type CustomKitElement,
  type KitCategory,
} from './custom-store'
import { Specimen } from './Specimen'
import './kit.css'

type VisualSystemViewProps = {
  page: string
}

const PAGE_TO_CATEGORY: Record<string, KitCategory | 'lab'> = {
  'Visual Buttons': 'buttons',
  'Visual Messages': 'messages',
  'Visual Action bars': 'action-bars',
  'Visual Cards': 'cards',
  'Visual Inputs': 'inputs',
  'Visual Tokens': 'tokens',
  'Visual Icons': 'icons',
  'Visual Lab': 'lab',
}

const COLOR_TOKENS = [
  ['--yl-bg', '#f4f6f8'],
  ['--yl-surface', '#ffffff'],
  ['--yl-surface-2', '#f7f9fa'],
  ['--yl-text', '#415364'],
  ['--yl-text-2', '#5b6b78'],
  ['--yl-text-3', '#7a8a96'],
  ['--yl-stroke', '#e4e7ec'],
  ['--yl-go', '#3d5b58'],
  ['--yl-go-soft', '#eef3f2'],
  ['--yl-energy', '#c45c4e'],
  ['--yl-energy-soft', '#f8e8e4'],
  ['--yl-ink', '#415364'],
  ['--yl-fill', '#eef3f2'],
  ['--yl-success', '#027a48'],
  ['--yl-warning', '#b54708'],
  ['--yl-danger', '#b42318'],
] as const

function DemoActionBar() {
  const { t } = useTranslation()
  return (
    <div className="page-action-bar">
      <input
        className="search-input"
        type="search"
        placeholder={t('kit.searchPlaceholder')}
        aria-label={t('kit.searchPlaceholder')}
        readOnly
      />
      <div className="header-actions">
        <button
          className="btn-icon btn-icon-ghost btn-filter"
          type="button"
          aria-label={t('common.filters')}
        >
          <YlIcon name="line.3.horizontal.decrease" size={16} />
          <span className="filter-badge">2</span>
        </button>
        <button
          className="btn-ghost"
          type="button"
          aria-label={t('common.refresh')}
        >
          <YlIcon name="arrow.clockwise" size={16} />
        </button>
        <button
          className="btn-primary"
          type="button"
          aria-label={t('kit.add')}
        >
          <YlIcon name="plus" size={16} />
        </button>
      </div>
    </div>
  )
}

function PendingStub({ item }: { item: CustomKitElement }) {
  const { t } = useTranslation()
  return (
    <div className="yl-kit-pending">
      <strong>{item.name}</strong>
      <p>{item.notes || t('kit.pendingBody')}</p>
    </div>
  )
}

function CustomSpecimens({
  items,
  onRemove,
}: {
  items: CustomKitElement[]
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return null
  }

  return (
    <>
      {items.map((item) => (
        <div key={item.id}>
          <Specimen
            refName={item.id}
            title={`${item.name} (${t('kit.pending')})`}
            usage={item.notes || t('kit.pendingBody')}
            desktop={<PendingStub item={item} />}
            mobile={item.hasMobileVariant ? <PendingStub item={item} /> : undefined}
          />
          <div className="yl-kit-row" style={{ marginTop: 8 }}>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => onRemove(item.id)}
            >
              {t('kit.removeDraft')}
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

export function VisualSystemView({ page }: VisualSystemViewProps) {
  const { t } = useTranslation()
  const showToast = useToast()
  const confirm = useConfirm()
  const [customs, setCustoms] = useState<CustomKitElement[]>(() =>
    readCustomKitElements(),
  )
  const [switchOn, setSwitchOn] = useState(true)
  const [segment, setSegment] = useState<'day' | 'kanban' | 'agenda'>('day')
  const [noticeOpen, setNoticeOpen] = useState(true)
  const [labId, setLabId] = useState('yl.card.example')
  const [labName, setLabName] = useState('')
  const [labCategory, setLabCategory] = useState<KitCategory>('cards')
  const [labNotes, setLabNotes] = useState('')
  const [labMobile, setLabMobile] = useState(true)
  const [labError, setLabError] = useState('')

  const section = PAGE_TO_CATEGORY[page] ?? 'buttons'
  const customForSection = useMemo(
    () =>
      section === 'lab'
        ? customs
        : customs.filter((item) => item.category === section),
    [customs, section],
  )

  const removeDraft = async (id: string) => {
    const ok = await confirm({
      title: t('kit.removeDraft'),
      message: t('kit.removeDraftConfirm', { ref: id }),
      confirmLabel: t('kit.removeDraft'),
      destructive: true,
    })
    if (!ok) {
      return
    }
    setCustoms(removeCustomKitElement(id))
  }

  const saveDraft = (event: FormEvent) => {
    event.preventDefault()
    const id = labId.trim()
    const name = labName.trim()
    if (!KIT_REF_PATTERN.test(id)) {
      setLabError(t('kit.invalidRef'))
      return
    }
    if (!name) {
      setLabError(t('kit.nameRequired'))
      return
    }
    if (customs.some((item) => item.id === id)) {
      setLabError(t('kit.refTaken'))
      return
    }
    const next = upsertCustomKitElement({
      id,
      name,
      category: labCategory,
      notes: labNotes.trim(),
      hasMobileVariant: labMobile,
      createdAt: new Date().toISOString(),
    })
    setCustoms(next)
    setLabError('')
    setLabName('')
    setLabNotes('')
    showToast(t('kit.savedDraft'))
  }

  const buttons: ReactNode = (
    <>
      <Specimen
        refName="yl.button.primary"
        title={t('kit.buttonPrimary')}
        usage={t('kit.buttonPrimaryUsage')}
        desktop={
          <div className="yl-kit-row">
            <button className="btn-primary" type="button">
              {t('kit.add')}
            </button>
            <button className="btn-primary" type="button" disabled>
              {t('kit.disabled')}
            </button>
          </div>
        }
      />
      <Specimen
        refName="yl.button.primary.icon"
        title={t('kit.buttonPrimaryIcon')}
        usage={t('kit.buttonPrimaryIconUsage')}
        desktop={
          <button className="btn-primary" type="button">
            <YlIcon name="plus" size={16} /> {t('kit.add')}
          </button>
        }
      />
      <Specimen
        refName="yl.button.secondary"
        title={t('kit.buttonSecondary')}
        usage={t('kit.buttonSecondaryUsage')}
        desktop={
          <button className="btn-secondary" type="button">
            {t('common.cancel')}
          </button>
        }
      />
      <Specimen
        refName="yl.button.ghost"
        title={t('kit.buttonGhost')}
        usage={t('kit.buttonGhostUsage')}
        desktop={
          <div className="yl-kit-row">
            <button className="btn-ghost" type="button">
              {t('common.filters')}
            </button>
            <button className="btn-ghost is-active" type="button">
              {t('kit.active')}
            </button>
          </div>
        }
      />
      <Specimen
        refName="yl.button.danger"
        title={t('kit.buttonDanger')}
        usage={t('kit.buttonDangerUsage')}
        desktop={
          <button className="btn-danger" type="button">
            {t('kit.deleteAction')}
          </button>
        }
      />
      <Specimen
        refName="yl.button.link"
        title={t('kit.buttonLink')}
        usage={t('kit.buttonLinkUsage')}
        desktop={
          <button className="btn-link" type="button">
            {t('common.retry')}
          </button>
        }
      />
      <Specimen
        refName="yl.button.icon"
        title={t('kit.buttonIcon')}
        usage={t('kit.buttonIconUsage')}
        desktop={
          <button
            className="btn-icon"
            type="button"
            aria-label={t('common.close')}
          >
            <YlIcon name="xmark" size={16} />
          </button>
        }
      />
      <Specimen
        refName="yl.button.iconGhost"
        title={t('kit.buttonIconGhost')}
        usage={t('kit.buttonIconGhostUsage')}
        desktop={
          <div className="yl-kit-row">
            <button
              className="btn-icon btn-icon-ghost"
              type="button"
              aria-label={t('common.filters')}
            >
              <YlIcon name="line.3.horizontal.decrease" size={16} />
            </button>
            <button
              className="btn-icon btn-icon-ghost is-active"
              type="button"
              aria-label={t('kit.active')}
            >
              <YlIcon name="line.3.horizontal.decrease" size={16} />
            </button>
          </div>
        }
      />
      <Specimen
        refName="yl.button.filter"
        title={t('kit.buttonFilter')}
        usage={t('kit.buttonFilterUsage')}
        desktop={
          <button
            className="btn-icon btn-icon-ghost btn-filter"
            type="button"
            aria-label={t('common.filters')}
          >
            <YlIcon name="line.3.horizontal.decrease" size={16} />
            <span className="filter-badge">3</span>
          </button>
        }
      />
    </>
  )

  const messages: ReactNode = (
    <>
      <Specimen
        refName="yl.text.eyebrow"
        title={t('kit.textEyebrow')}
        usage={t('kit.textEyebrowUsage')}
        desktop={<p className="eyebrow">{t('kit.sectionName')}</p>}
      />
      <Specimen
        refName="yl.text.subtitle"
        title={t('kit.textSubtitle')}
        usage={t('kit.textSubtitleUsage')}
        desktop={<p className="subtitle">{t('kit.subtitleSample')}</p>}
      />
      <Specimen
        refName="yl.text.hint"
        title={t('kit.textHint')}
        usage={t('kit.textHintUsage')}
        desktop={<p className="form-field-hint">{t('kit.hintSample')}</p>}
      />
      <Specimen
        refName="yl.notice.alert"
        title={t('kit.noticeAlert')}
        usage={t('kit.noticeAlertUsage')}
        desktop={<div className="alert">{t('kit.alertSample')}</div>}
      />
      <Specimen
        refName="yl.notice.banner"
        title={t('kit.noticeBanner')}
        usage={t('kit.noticeBannerUsage')}
        desktop={
          <div className="alert alert-banner" role="alert">
            <span className="alert-banner-message">{t('kit.bannerSample')}</span>
            <button
              className="alert-banner-close"
              type="button"
              aria-label={t('common.close')}
            >
              <YlIcon name="xmark" size={14} />
            </button>
          </div>
        }
      />
      <Specimen
        refName="yl.notice.error"
        title={t('kit.noticeError')}
        usage={t('kit.noticeErrorUsage')}
        desktop={<div className="notice error">{t('kit.errorSample')}</div>}
      />
      <Specimen
        refName="yl.notice.success"
        title={t('kit.noticeSuccess')}
        usage={t('kit.noticeSuccessUsage')}
        desktop={<div className="notice success">{t('kit.successSample')}</div>}
      />
      <Specimen
        refName="yl.notice.warning"
        title={t('kit.noticeWarning')}
        usage={t('kit.noticeWarningUsage')}
        desktop={<div className="notice warning">{t('kit.warningSample')}</div>}
      />
      <Specimen
        refName="yl.notice.dismissible"
        title={t('kit.noticeDismissible')}
        usage={t('kit.noticeDismissibleUsage')}
        desktop={
          noticeOpen ? (
            <DismissibleNotice
              variant="warning"
              dismissLabel={t('common.close')}
              onDismiss={() => setNoticeOpen(false)}
            >
              {t('kit.warningSample')}
            </DismissibleNotice>
          ) : (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setNoticeOpen(true)}
            >
              {t('kit.showAgain')}
            </button>
          )
        }
      />
      <Specimen
        refName="yl.empty"
        title={t('kit.empty')}
        usage={t('kit.emptyUsage')}
        desktop={
          <EmptyState
            message={t('kit.emptySample')}
            actionLabel={t('kit.add')}
            onAction={() => undefined}
          />
        }
      />
      <Specimen
        refName="yl.toast"
        title={t('kit.toast')}
        usage={t('kit.toastUsage')}
        desktop={
          <div className="yl-kit-stack">
            <div className="yl-kit-row">
              <div className="yl-toast">{t('kit.toastSuccessSample')}</div>
              <div className="yl-toast is-error">{t('kit.toastErrorSample')}</div>
            </div>
            <div className="yl-kit-row">
              <button
                className="btn-primary"
                type="button"
                onClick={() => showToast(t('kit.toastSuccessSample'))}
              >
                {t('kit.showToast')}
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={() => showToast(t('kit.toastErrorSample'), 'error')}
              >
                {t('kit.showToastError')}
              </button>
            </div>
          </div>
        }
      />
      <Specimen
        refName="yl.confirm"
        title={t('kit.confirm')}
        usage={t('kit.confirmUsage')}
        desktop={
          <div className="yl-kit-stack">
            <div className="modal-overlay">
              <div className="modal yl-confirm">
                <div className="modal-header">
                  <h3 className="modal-title">{t('common.confirm')}</h3>
                </div>
                <div className="modal-body">
                  <p className="yl-confirm-message">{t('kit.confirmSample')}</p>
                </div>
                <div className="modal-footer">
                  <button className="btn-secondary" type="button">
                    {t('common.cancel')}
                  </button>
                  <button className="btn-danger" type="button">
                    {t('kit.removeDraft')}
                  </button>
                </div>
              </div>
            </div>
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                void confirm({
                  title: t('common.confirm'),
                  message: t('kit.confirmSample'),
                  destructive: true,
                  confirmLabel: t('kit.removeDraft'),
                })
              }
            >
              {t('kit.showConfirm')}
            </button>
          </div>
        }
      />
    </>
  )

  const actionBars: ReactNode = (
    <Specimen
      refName="yl.actionBar.page"
      title={t('kit.actionBar')}
      usage={t('kit.actionBarUsage')}
      desktop={<DemoActionBar />}
      mobile={<DemoActionBar />}
    />
  )

  const cards: ReactNode = (
    <>
      <Specimen
        refName="yl.card.surface"
        title={t('kit.cardSurface')}
        usage={t('kit.cardSurfaceUsage')}
        desktop={
          <section className="card">
            <p className="card-title">{t('kit.cardSurface')}</p>
            <p className="card-subtitle">{t('kit.cardSurfaceBody')}</p>
          </section>
        }
      />
      <Specimen
        refName="yl.card.compact"
        title={t('kit.cardCompact')}
        usage={t('kit.cardCompactUsage')}
        desktop={
          <article className="card card-compact">
            <p className="card-label">{t('kit.statLabel')}</p>
            <p className="card-value">24</p>
            <p className="card-meta">{t('kit.statMeta')}</p>
          </article>
        }
        mobile={
          <article className="card card-compact">
            <p className="card-label">{t('kit.statLabel')}</p>
            <p className="card-value">24</p>
            <p className="card-meta">{t('kit.statMeta')}</p>
          </article>
        }
      />
      <Specimen
        refName="yl.card.stat"
        title={t('kit.cardStat')}
        usage={t('kit.cardStatUsage')}
        desktop={
          <div className="summary-cards">
            <StatCard
              label={t('kit.statLabel')}
              value={12}
              meta={t('kit.statMeta')}
            />
            <StatCard
              label={t('kit.statReady')}
              value="8 / 12"
              meta={t('kit.statMeta')}
              tone="success"
            />
            <StatCard
              label={t('kit.statAttention')}
              value={3}
              meta={t('kit.statMeta')}
              tone="warning"
            />
          </div>
        }
        mobile={
          <div className="summary-cards">
            <StatCard
              label={t('kit.statLabel')}
              value={12}
              meta={t('kit.statMeta')}
            />
            <StatCard
              label={t('kit.statReady')}
              value="8 / 12"
              meta={t('kit.statMeta')}
              tone="success"
            />
          </div>
        }
      />
      <Specimen
        refName="yl.card.progress"
        title={t('kit.cardProgress')}
        usage={t('kit.cardProgressUsage')}
        desktop={
          <ProgressCard
            label={t('kit.progressLabel')}
            valueLabel={t('today.ratio', { done: 8, total: 12 })}
            value={8}
            max={12}
            meta={t('kit.progressMeta')}
          />
        }
        mobile={
          <ProgressCard
            label={t('kit.progressLabel')}
            valueLabel={t('today.ratio', { done: 8, total: 12 })}
            value={8}
            max={12}
            meta={t('kit.progressMeta')}
          />
        }
      />
    </>
  )

  const inputs: ReactNode = (
    <>
      <Specimen
        refName="yl.input.search"
        title={t('kit.inputSearch')}
        usage={t('kit.inputSearchUsage')}
        desktop={
          <input
            className="search-input"
            type="search"
            placeholder={t('kit.searchPlaceholder')}
            readOnly
          />
        }
        mobile={
          <input
            className="search-input"
            type="search"
            placeholder={t('kit.searchPlaceholder')}
            readOnly
          />
        }
      />
      <Specimen
        refName="yl.input.select"
        title={t('kit.inputSelect')}
        usage={t('kit.inputSelectUsage')}
        desktop={
          <select className="select-input" defaultValue="open" aria-label={t('kit.inputSelect')}>
            <option value="open">{t('kit.selectOpen')}</option>
            <option value="done">{t('kit.selectDone')}</option>
          </select>
        }
        mobile={
          <select className="select-input" defaultValue="open" aria-label={t('kit.inputSelect')}>
            <option value="open">{t('kit.selectOpen')}</option>
            <option value="done">{t('kit.selectDone')}</option>
          </select>
        }
      />
      <Specimen
        refName="yl.switch"
        title={t('kit.switch')}
        usage={t('kit.switchUsage')}
        desktop={
          <YallaSwitch
            on={switchOn}
            label={t('kit.switch')}
            onToggle={() => setSwitchOn((current) => !current)}
          />
        }
      />
      <Specimen
        refName="yl.segment"
        title={t('kit.segment')}
        usage={t('kit.segmentUsage')}
        desktop={
          <SegmentedControl
            ariaLabel={t('kit.segment')}
            value={segment}
            onChange={setSegment}
            options={[
              { id: 'day', label: t('kit.segmentDay') },
              { id: 'kanban', label: t('kit.segmentKanban') },
              { id: 'agenda', label: t('kit.segmentAgenda') },
            ]}
          />
        }
        mobile={
          <SegmentedControl
            ariaLabel={t('kit.segment')}
            value={segment}
            onChange={setSegment}
            options={[
              { id: 'day', label: t('kit.segmentDay') },
              { id: 'kanban', label: t('kit.segmentKanban') },
              { id: 'agenda', label: t('kit.segmentAgenda') },
            ]}
          />
        }
      />
    </>
  )

  const tokens: ReactNode = (
    <Specimen
      refName="yl.token.color"
      title={t('kit.tokens')}
      usage={t('kit.tokensUsage')}
      desktop={
        <div className="yl-kit-swatches">
          {COLOR_TOKENS.map(([name, value]) => (
            <div className="yl-kit-swatch" key={name}>
              <div
                className="yl-kit-swatch-chip"
                style={{ background: `var(${name})` }}
              />
              <div className="yl-kit-swatch-meta">
                <span className="yl-kit-swatch-name">{name}</span>
                <span className="yl-kit-swatch-value">{value}</span>
              </div>
            </div>
          ))}
        </div>
      }
    />
  )

  const icons: ReactNode = (
    <>
      <p className="yl-kit-legend">{t('kit.iconsIntro')}</p>
      {ICON_GROUPS.map((group) => (
        <Specimen
          key={group.id}
          refName={`yl.icon.${group.id}`}
          title={t(`kit.iconGroup.${group.id}`)}
          usage={t(`kit.iconGroupUsage.${group.id}`)}
          desktop={
            <div className="yl-kit-icons">
              {group.names.map((name: YlIconName) => (
                <div className="yl-kit-icon-cell" key={name}>
                  <div className="yl-kit-icon-pair">
                    <YlIcon name={name} size={28} />
                    {ICON_HAS_FILL.has(name) ? (
                      <YlIcon name={name} size={28} variant="fill" />
                    ) : null}
                  </div>
                  <code className="yl-kit-swatch-name">
                    {`yl.icon.${name}`.replace(/\./g, '.\u200b')}
                  </code>
                  {ICON_HAS_FILL.has(name) ? (
                    <span className="yl-kit-swatch-value">{t('kit.iconVariants')}</span>
                  ) : null}
                </div>
              ))}
            </div>
          }
        />
      ))}
    </>
  )

  const lab: ReactNode = (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{t('kit.labTitle')}</h2>
          <p className="card-subtitle">{t('kit.labSubtitle')}</p>
        </div>
      </div>
      <form className="yl-kit-form" onSubmit={saveDraft}>
        <label>
          {t('kit.refField')}
          <input
            className="search-input"
            value={labId}
            onChange={(event) => setLabId(event.target.value)}
            placeholder="yl.card.numeric"
            spellCheck={false}
          />
        </label>
        <label>
          {t('kit.nameField')}
          <input
            className="search-input"
            value={labName}
            onChange={(event) => setLabName(event.target.value)}
            placeholder={t('kit.namePlaceholder')}
          />
        </label>
        <label>
          {t('kit.categoryField')}
          <select
            className="select-input"
            value={labCategory}
            onChange={(event) => {
              const value = event.target.value
              if (isKitCategory(value)) {
                setLabCategory(value)
              }
            }}
          >
            {KIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`kit.category.${category}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="yl-kit-check">
          <input
            type="checkbox"
            checked={labMobile}
            onChange={(event) => setLabMobile(event.target.checked)}
          />
          {t('kit.hasMobileVariant')}
        </label>
        <label className="full-width">
          {t('kit.notesField')}
          <textarea
            value={labNotes}
            onChange={(event) => setLabNotes(event.target.value)}
            placeholder={t('kit.notesPlaceholder')}
          />
        </label>
        {labError ? <div className="alert full-width">{labError}</div> : null}
        <div className="full-width">
          <button className="btn-primary" type="submit">
            {t('kit.saveDraft')}
          </button>
        </div>
      </form>
      <h3 className="card-title" style={{ marginTop: 24 }}>
        {t('kit.drafts')}
      </h3>
      {customs.length === 0 ? (
        <p className="subtitle">{t('kit.noDrafts')}</p>
      ) : (
        <ul className="yl-kit-custom-list">
          {customs.map((item) => (
            <li className="yl-kit-custom-item" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <div>
                  <code>{item.id}</code> · {t(`kit.category.${item.category}`)}
                </div>
              </div>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void removeDraft(item.id)}
              >
                {t('kit.removeDraft')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  const body =
    section === 'buttons'
      ? buttons
      : section === 'messages'
        ? messages
        : section === 'action-bars'
          ? actionBars
          : section === 'cards'
            ? cards
            : section === 'inputs'
              ? inputs
              : section === 'tokens'
                ? tokens
                : section === 'icons'
                  ? icons
                  : lab

  return (
    <div className="yl-kit">
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('kit.eyebrow')}</p>
          <h1 className="page-title">{t(`pages.${page}`, { defaultValue: page })}</h1>
          <p className="subtitle">{t('kit.intro')}</p>
        </div>
      </header>
      <p className="yl-kit-legend">{t('kit.legend')}</p>
      {section !== 'lab' ? (
        <CustomSpecimens items={customForSection} onRemove={(id) => void removeDraft(id)} />
      ) : null}
      {body}
    </div>
  )
}
