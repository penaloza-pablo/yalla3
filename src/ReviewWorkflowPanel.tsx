import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'

const PRIMARY = '#6D5EF7'
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'

const STEP_LABELS = [
  'Not started',
  'Strategy',
  'Removal request',
  'Reminder',
  'Deletion confirmation',
  'Finished',
] as const

function RwNextSkipRow({
  onNext,
  onSkip,
  nextLabel = 'Next',
  skipLabel = 'Skip',
  nextDisabled,
  skipDisabled,
}: {
  onNext: () => void | Promise<void>
  onSkip: () => void | Promise<void>
  nextLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
  skipDisabled?: boolean
}) {
  return (
    <div className="rw-next-skip-row">
      <button
        className="btn-primary rw-cta"
        type="button"
        disabled={nextDisabled}
        onClick={() => {
          void onNext()
        }}
      >
        {nextLabel}
      </button>
      <button
        className="btn-ghost rw-skip"
        type="button"
        disabled={skipDisabled}
        onClick={() => {
          void onSkip()
        }}
      >
        {skipLabel}
      </button>
    </div>
  )
}

export type ReviewWorkflowPersistPayload = {
  Status?: string
  WorkflowStep?: string
  WorkflowStepIndex?: number
  RemovalStrategy?: string
  Compensation?: number
  ReviewDeleted?: string
  LowRatingReason?: string
}

const SKIP_FINISH_PAYLOAD: ReviewWorkflowPersistPayload = {
  WorkflowStep: 'Finished',
  WorkflowStepIndex: 6,
  Status: 'Closed - Skipped',
}

export type ReviewWorkflowRow = {
  reviewId: string
  rating: number
  guestPaidDay: number
  status: string
  workflowStep: string
  workflowStepIndex: number
  removalStrategy: string
  compensation: number
  reviewDeleted: string
  lowRatingReason: string
}

type Props = {
  row: ReviewWorkflowRow
  onPersist: (payload: ReviewWorkflowPersistPayload) => Promise<void>
  isSaving: boolean
}

function getStepVisualState(
  stepNumber: number,
  dbStep: number,
  highlightStep: number,
  fiveStars: boolean,
): 'complete' | 'active' | 'incomplete' {
  if (fiveStars || dbStep === 6) {
    return 'complete'
  }
  if (stepNumber < dbStep) {
    return 'complete'
  }
  if (stepNumber === highlightStep) {
    return 'active'
  }
  return 'incomplete'
}

/** Line after circle `stepNumber` (1–5), toward next step */
function connectorIsFilled(
  stepNumber: number,
  current: number,
  fiveStars: boolean,
): boolean {
  if (fiveStars || current === 6) {
    return true
  }
  return current > stepNumber
}

export function resolveWorkflowStepIndex(row: {
  workflowStepIndex: number
  workflowStep: string
}): number {
  const raw = row.workflowStepIndex
  if (Number.isFinite(raw) && raw >= 1 && raw <= 6) {
    return Math.floor(raw)
  }
  const s = row.workflowStep.trim().toLowerCase()
  const map: Record<string, number> = {
    'not started': 1,
    strategy: 2,
    'removal request': 3,
    reminder: 4,
    'deletion confirmation': 5,
    finished: 6,
  }
  return map[s] ?? 1
}

function isFiveStarsStatus(status: string) {
  return status.trim().toLowerCase() === '5 stars'
}

type StrategyChoice = 'guest_negotiation' | 'channel_removal' | null

function parseStrategyFromRow(removalStrategy: string): StrategyChoice {
  const s = removalStrategy.trim().toLowerCase()
  if (s.includes('negotiation') || s.includes('guest')) {
    return 'guest_negotiation'
  }
  if (s.includes('channel') || s.includes('removal to')) {
    return 'channel_removal'
  }
  return null
}

export function ReviewWorkflowPanel({ row, onPersist, isSaving }: Props) {
  const dbStep = resolveWorkflowStepIndex(row)
  const fiveStars = isFiveStarsStatus(row.status)
  const [viewStep, setViewStep] = useState<number | null>(null)
  const highlightStep = viewStep ?? dbStep
  const displayStep = highlightStep

  useEffect(() => {
    setViewStep(null)
  }, [row.workflowStepIndex, row.reviewId])

  const [strategyChoice, setStrategyChoice] = useState<StrategyChoice>(() =>
    parseStrategyFromRow(row.removalStrategy),
  )
  const [compensationPercent, setCompensationPercent] = useState<
    0 | 15 | 20 | 25
  >(15)
  const [compensationEuro, setCompensationEuro] = useState(() =>
    row.compensation > 0 ? row.compensation : calcEuro(row.guestPaidDay, 15),
  )

  const [step3Phase, setStep3Phase] = useState(0)
  const [step4DirectOut, setStep4DirectOut] = useState('')
  const [step4ReminderOut, setStep4ReminderOut] = useState('')
  const [step5Branch, setStep5Branch] = useState<
    'choose' | 'compensation' | 'public_idle' | 'public_ready'
  >('choose')

  useEffect(() => {
    setStrategyChoice(parseStrategyFromRow(row.removalStrategy))
    if (row.compensation > 0) {
      setCompensationEuro(row.compensation)
    }
  }, [row.removalStrategy, row.compensation, row.reviewId])

  useEffect(() => {
    setStep3Phase(0)
  }, [dbStep, row.reviewId])

  useEffect(() => {
    setStep4DirectOut('')
    setStep4ReminderOut('')
  }, [dbStep, row.reviewId])

  useEffect(() => {
    setStep5Branch('choose')
  }, [dbStep, row.reviewId])

  useEffect(() => {
    if (dbStep !== 5) {
      return
    }
    if (row.reviewDeleted.trim().toLowerCase() === 'yes') {
      setStep5Branch('compensation')
    }
  }, [dbStep, row.reviewId, row.reviewDeleted])

  useEffect(() => {
    if (strategyChoice === 'guest_negotiation') {
      setCompensationEuro(calcEuro(row.guestPaidDay, compensationPercent))
    }
  }, [compensationPercent, row.guestPaidDay, strategyChoice])

  const persist = useCallback(
    async (payload: ReviewWorkflowPersistPayload) => {
      await onPersist(payload)
    },
    [onPersist],
  )

  return (
    <div className="rw-workflow">
      <div className="rw-progress-outer">
        <div className="rw-progress-scroll">
          <div className="rw-progress" role="list" aria-label="Review workflow progress">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const isLast = n === 6
              const visual = getStepVisualState(
                n,
                dbStep,
                highlightStep,
                fiveStars,
              )

              const circleClass =
                visual === 'complete'
                  ? 'rw-step-circle is-complete'
                  : visual === 'active'
                    ? 'rw-step-circle is-active'
                    : 'rw-step-circle is-incomplete'

              const labelClass =
                visual === 'complete'
                  ? 'rw-step-label is-complete-label'
                  : visual === 'active'
                    ? 'rw-step-label is-active-label'
                    : 'rw-step-label is-muted-label'

              const connectorDone = connectorIsFilled(n, dbStep, fiveStars)

              return (
                <Fragment key={label}>
                  <div className="rw-progress-step" role="listitem">
                    <button
                      type="button"
                      className="rw-progress-hit"
                      disabled={fiveStars}
                      aria-current={
                        highlightStep === n ? 'step' : undefined
                      }
                      aria-label={`Go to ${label}`}
                      onClick={() => {
                        if (!fiveStars) {
                          setViewStep(n)
                        }
                      }}
                    >
                      <div
                        className={circleClass}
                        style={
                          {
                            '--rw-primary': PRIMARY,
                          } as CSSProperties
                        }
                      >
                        {n}
                      </div>
                      <span className={labelClass}>{label}</span>
                    </button>
                  </div>
                  {!isLast ? (
                    <div
                      className={
                        connectorDone
                          ? 'rw-connector is-done'
                          : 'rw-connector'
                      }
                      aria-hidden
                    />
                  ) : null}
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rw-actions-card">
        {fiveStars ? (
          <FiveStarsFinished row={row} />
        ) : (
          <WorkflowActions
            row={row}
            displayStep={displayStep}
            isSaving={isSaving}
            persist={persist}
            strategyChoice={strategyChoice}
            setStrategyChoice={setStrategyChoice}
            compensationPercent={compensationPercent}
            setCompensationPercent={setCompensationPercent}
            compensationEuro={compensationEuro}
            setCompensationEuro={setCompensationEuro}
            step3Phase={step3Phase}
            setStep3Phase={setStep3Phase}
            step4DirectOut={step4DirectOut}
            setStep4DirectOut={setStep4DirectOut}
            step4ReminderOut={step4ReminderOut}
            setStep4ReminderOut={setStep4ReminderOut}
            step5Branch={step5Branch}
            setStep5Branch={setStep5Branch}
          />
        )}
      </div>
    </div>
  )
}

function calcEuro(guestPaidDay: number, pct: number) {
  if (!guestPaidDay || !Number.isFinite(guestPaidDay)) {
    return 0
  }
  return Math.round(guestPaidDay * (pct / 100) * 100) / 100
}

function FiveStarsFinished({ row }: { row: ReviewWorkflowRow }) {
  return (
    <div className="rw-finished-block">
      <p className="rw-actions-title">No action required</p>
      <p className="rw-actions-desc">
        This review received 5 stars.
      </p>
      <span className="rw-badge rw-badge-blue">Closed — 5 stars review</span>
      {row.lowRatingReason ? (
        <p className="rw-meta-text">{row.lowRatingReason}</p>
      ) : null}
    </div>
  )
}

type ActionsProps = {
  row: ReviewWorkflowRow
  /** Step shown in the actions panel (selection or DB) */
  displayStep: number
  isSaving: boolean
  persist: (p: ReviewWorkflowPersistPayload) => Promise<void>
  strategyChoice: StrategyChoice
  setStrategyChoice: (s: StrategyChoice) => void
  compensationPercent: 0 | 15 | 20 | 25
  setCompensationPercent: (p: 0 | 15 | 20 | 25) => void
  compensationEuro: number
  setCompensationEuro: (n: number) => void
  step3Phase: number
  setStep3Phase: (n: number) => void
  step4DirectOut: string
  setStep4DirectOut: (s: string) => void
  step4ReminderOut: string
  setStep4ReminderOut: (s: string) => void
  step5Branch:
    | 'choose'
    | 'compensation'
    | 'public_idle'
    | 'public_ready'
  setStep5Branch: (
    b: 'choose' | 'compensation' | 'public_idle' | 'public_ready',
  ) => void
}

function WorkflowActions(props: ActionsProps) {
  const {
    row,
    displayStep,
    isSaving,
    persist,
    strategyChoice,
    setStrategyChoice,
    compensationPercent,
    setCompensationPercent,
    compensationEuro,
    setCompensationEuro,
    step3Phase,
    setStep3Phase,
    step4DirectOut,
    setStep4DirectOut,
    step4ReminderOut,
    setStep4ReminderOut,
    step5Branch,
    setStep5Branch,
  } = props

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }, [])

  if (displayStep === 6) {
    return (
      <Step6Finished
        row={row}
        copyText={copyText}
      />
    )
  }

  if (displayStep === 5) {
    return (
      <Step5Deletion
        isSaving={isSaving}
        persist={persist}
        branch={step5Branch}
        setBranch={setStep5Branch}
        copyText={copyText}
      />
    )
  }

  if (displayStep === 4) {
    return (
      <Step4Reminder
        isSaving={isSaving}
        persist={persist}
        directOut={step4DirectOut}
        setDirectOut={setStep4DirectOut}
        reminderOut={step4ReminderOut}
        setReminderOut={setStep4ReminderOut}
        copyText={copyText}
      />
    )
  }

  if (displayStep === 3) {
    return (
      <Step3RemovalRequest
        isSaving={isSaving}
        persist={persist}
        phase={step3Phase}
        setPhase={setStep3Phase}
        copyText={copyText}
      />
    )
  }

  if (displayStep === 2) {
    return (
      <Step2Strategy
        row={row}
        isSaving={isSaving}
        persist={persist}
        strategyChoice={strategyChoice}
        setStrategyChoice={setStrategyChoice}
        compensationPercent={compensationPercent}
        setCompensationPercent={setCompensationPercent}
        compensationEuro={compensationEuro}
        setCompensationEuro={setCompensationEuro}
      />
    )
  }

  return (
    <Step1NotStarted
      isSaving={isSaving}
      onStart={() =>
        persist({
          Status: 'Working',
          WorkflowStep: 'Strategy',
          WorkflowStepIndex: 2,
        })
      }
      onSkip={() => persist(SKIP_FINISH_PAYLOAD)}
    />
  )
}

function Step1NotStarted({
  isSaving,
  onStart,
  onSkip,
}: {
  isSaving: boolean
  onStart: () => Promise<void>
  onSkip: () => Promise<void>
}) {
  return (
    <div className="rw-step-inner rw-step-inner-center">
      <p className="rw-actions-title">Review workflow</p>
      <p className="rw-actions-desc">
        Start the review resolution process.
      </p>
      <RwNextSkipRow
        nextLabel="Start"
        nextDisabled={isSaving}
        skipDisabled={isSaving}
        onNext={() => onStart()}
        onSkip={() => onSkip()}
      />
    </div>
  )
}

function Step2Strategy({
  row,
  isSaving,
  persist,
  strategyChoice,
  setStrategyChoice,
  compensationPercent,
  setCompensationPercent,
  compensationEuro,
  setCompensationEuro,
}: {
  row: ReviewWorkflowRow
  isSaving: boolean
  persist: (p: ReviewWorkflowPersistPayload) => Promise<void>
  strategyChoice: StrategyChoice
  setStrategyChoice: (s: StrategyChoice) => void
  compensationPercent: 0 | 15 | 20 | 25
  setCompensationPercent: (p: 0 | 15 | 20 | 25) => void
  compensationEuro: number
  setCompensationEuro: (n: number) => void
}) {
  const canNext = strategyChoice !== null
  const presets = [0, 15, 20, 25] as const

  return (
    <div className="rw-step-inner">
      <p className="rw-actions-title">Choose a strategy</p>
      <div className="rw-strategy-grid">
        <button
          type="button"
          className={`rw-strategy-card ${
            strategyChoice === 'guest_negotiation' ? 'is-selected' : ''
          }`}
          onClick={() => setStrategyChoice('guest_negotiation')}
        >
          <span className="rw-strategy-card-title">Guest negotiation</span>
          <span className="rw-strategy-card-desc">
            Explain negotiation strategy.
          </span>
        </button>
        <button
          type="button"
          className={`rw-strategy-card ${
            strategyChoice === 'channel_removal' ? 'is-selected' : ''
          }`}
          onClick={() => setStrategyChoice('channel_removal')}
        >
          <span className="rw-strategy-card-title">
            Request removal to channel
          </span>
          <span className="rw-strategy-card-desc">
            Channel/platform removal request workflow.
          </span>
        </button>
      </div>

      {strategyChoice === 'guest_negotiation' ? (
        <div className="rw-compensation-block">
          <p className="rw-field-label">Compensation</p>
          <div className="rw-preset-row">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn-secondary rw-preset ${
                  compensationPercent === p ? 'is-active' : ''
                }`}
                onClick={() => {
                  setCompensationPercent(p)
                  setCompensationEuro(calcEuro(row.guestPaidDay, p))
                }}
              >
                {p}%
              </button>
            ))}
          </div>
          <label className="rw-field-label" htmlFor={`comp-${row.reviewId}`}>
            Compensation (€)
          </label>
          <input
            id={`comp-${row.reviewId}`}
            className="rw-input"
            type="number"
            min={0}
            step={0.01}
            value={Number.isFinite(compensationEuro) ? compensationEuro : 0}
            onChange={(e) => setCompensationEuro(Number(e.target.value))}
          />
        </div>
      ) : null}

      <RwNextSkipRow
        nextDisabled={isSaving || !canNext}
        skipDisabled={isSaving}
        onNext={() => {
          if (!strategyChoice) {
            return
          }
          const base = {
            WorkflowStep: 'Removal Request',
            WorkflowStepIndex: 3,
          }
          if (strategyChoice === 'guest_negotiation') {
            void persist({
              ...base,
              RemovalStrategy: 'Guest negotiation',
              Compensation: compensationEuro,
            })
          } else {
            void persist({
              ...base,
              RemovalStrategy: 'Request removal to channel',
              Compensation: 0,
            })
          }
        }}
        onSkip={() =>
          persist({
            WorkflowStep: 'Removal Request',
            WorkflowStepIndex: 3,
            RemovalStrategy: 'Skipped',
            Compensation: 0,
          })
        }
      />
    </div>
  )
}

function Step3RemovalRequest({
  isSaving,
  persist,
  phase,
  setPhase,
  copyText,
}: {
  isSaving: boolean
  persist: (p: ReviewWorkflowPersistPayload) => Promise<void>
  phase: number
  setPhase: (n: number) => void
  copyText: (t: string) => Promise<void>
}) {
  const advanceReminder = () =>
    persist({
      WorkflowStep: 'Reminder',
      WorkflowStepIndex: 4,
    })

  return (
    <div className="rw-step-inner">
      <p className="rw-actions-title">Removal request</p>
      {phase === 0 ? (
        <RwNextSkipRow
          nextLabel="Generate message"
          nextDisabled={isSaving}
          skipDisabled={isSaving}
          onNext={() => setPhase(1)}
          onSkip={() => void advanceReminder()}
        />
      ) : (
        <>
          <textarea
            className="rw-textarea"
            readOnly
            rows={5}
            value={LOREM}
          />
          <div className="rw-row-actions rw-row-actions-center">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => copyText(LOREM)}
            >
              Copy
            </button>
          </div>
          <p className="rw-prompt">Have you already contacted the guest?</p>
          <RwNextSkipRow
            nextDisabled={isSaving}
            skipDisabled={isSaving}
            onNext={() => void advanceReminder()}
            onSkip={() => void advanceReminder()}
          />
        </>
      )}
    </div>
  )
}

function Step4Reminder({
  isSaving,
  persist,
  directOut,
  setDirectOut,
  reminderOut,
  setReminderOut,
  copyText,
}: {
  isSaving: boolean
  persist: (p: ReviewWorkflowPersistPayload) => Promise<void>
  directOut: string
  setDirectOut: (s: string) => void
  reminderOut: string
  setReminderOut: (s: string) => void
  copyText: (t: string) => Promise<void>
}) {
  return (
    <div className="rw-step-inner">
      <p className="rw-actions-title">Reminder</p>
      <div className="rw-reminder-grid">
        <div className="rw-reminder-card">
          <p className="rw-strategy-card-title">Direct contact</p>
          <p className="rw-strategy-card-desc">
            Guest has not seen the original message.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setDirectOut(LOREM)
              void copyText(LOREM)
            }}
          >
            Generate direct contact message
          </button>
          {directOut ? (
            <div className="rw-gen-block">
              <textarea className="rw-textarea" readOnly rows={4} value={directOut} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyText(directOut)}
              >
                Copy
              </button>
            </div>
          ) : null}
        </div>
        <div className="rw-reminder-card">
          <p className="rw-strategy-card-title">Reminder follow-up</p>
          <p className="rw-strategy-card-desc">
            Guest agreed but has not deleted yet.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setReminderOut(LOREM)
              void copyText(LOREM)
            }}
          >
            Generate reminder
          </button>
          {reminderOut ? (
            <div className="rw-gen-block">
              <textarea
                className="rw-textarea"
                readOnly
                rows={4}
                value={reminderOut}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyText(reminderOut)}
              >
                Copy
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <p className="rw-prompt">Have you already contacted the guest?</p>
      <RwNextSkipRow
        nextDisabled={isSaving}
        skipDisabled={isSaving}
        onNext={() =>
          persist({
            WorkflowStep: 'Deletion confirmation',
            WorkflowStepIndex: 5,
          })
        }
        onSkip={() =>
          persist({
            WorkflowStep: 'Deletion confirmation',
            WorkflowStepIndex: 5,
          })
        }
      />
    </div>
  )
}

function Step5Deletion({
  isSaving,
  persist,
  branch,
  setBranch,
  copyText,
}: {
  isSaving: boolean
  persist: (p: ReviewWorkflowPersistPayload) => Promise<void>
  branch:
    | 'choose'
    | 'compensation'
    | 'public_idle'
    | 'public_ready'
  setBranch: (
    b: 'choose' | 'compensation' | 'public_idle' | 'public_ready',
  ) => void
  copyText: (t: string) => Promise<void>
}) {
  const publicResponse = LOREM

  const finishNoDeleted = () =>
    persist({
      WorkflowStep: 'Finished',
      WorkflowStepIndex: 6,
      Status: 'Closed - Review no deleted',
    })

  if (branch === 'choose') {
    return (
      <div className="rw-step-inner">
        <p className="rw-actions-title">Was the review deleted?</p>
        <div className="rw-icon-choice-row">
          <button
            type="button"
            className="rw-icon-choice rw-icon-yes"
            aria-label="Yes, deleted"
            disabled={isSaving}
            onClick={async () => {
              await persist({ ReviewDeleted: 'yes' })
              setBranch('compensation')
            }}
          >
            <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
              <path
                fill="currentColor"
                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
              />
            </svg>
            <span>Yes</span>
          </button>
          <button
            type="button"
            className="rw-icon-choice rw-icon-no"
            aria-label="No, not deleted"
            disabled={isSaving}
            onClick={async () => {
              await persist({ ReviewDeleted: 'no' })
              setBranch('public_idle')
            }}
          >
            <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
              />
            </svg>
            <span>No</span>
          </button>
        </div>
        <div className="rw-next-skip-row rw-next-skip-single">
          <button
            type="button"
            className="btn-ghost rw-skip"
            disabled={isSaving}
            onClick={() => persist(SKIP_FINISH_PAYLOAD)}
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (branch === 'compensation') {
    return (
      <div className="rw-step-inner">
        <p className="rw-actions-title">Was compensation sent?</p>
        <div className="rw-row-actions rw-row-actions-center">
          <button
            type="button"
            className="btn-primary"
            disabled={isSaving}
            onClick={() =>
              persist({
                WorkflowStep: 'Finished',
                WorkflowStepIndex: 6,
                Status: 'Closed - Review deleted',
              })
            }
          >
            Yes
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={isSaving}
            onClick={() =>
              persist({
                WorkflowStep: 'Finished',
                WorkflowStepIndex: 6,
                Status: 'Closed - Review deleted',
              })
            }
          >
            Skipped
          </button>
        </div>
        <div className="rw-next-skip-row rw-next-skip-single">
          <button
            type="button"
            className="btn-ghost rw-skip"
            disabled={isSaving}
            onClick={() => persist(SKIP_FINISH_PAYLOAD)}
          >
            Skip workflow
          </button>
        </div>
      </div>
    )
  }

  if (branch === 'public_idle') {
    return (
      <div className="rw-step-inner">
        <p className="rw-actions-title">Public response</p>
        <RwNextSkipRow
          nextLabel="Generate public response"
          nextDisabled={isSaving}
          skipDisabled={isSaving}
          onNext={() => setBranch('public_ready')}
          onSkip={() => persist(SKIP_FINISH_PAYLOAD)}
        />
      </div>
    )
  }

  return (
    <div className="rw-step-inner">
      <p className="rw-actions-title">Public response</p>
      <textarea
        className="rw-textarea"
        readOnly
        rows={5}
        value={publicResponse}
      />
      <div className="rw-row-actions rw-row-actions-center">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => copyText(publicResponse)}
        >
          Copy
        </button>
      </div>
      <p className="rw-prompt">Did you post the public response?</p>
      <RwNextSkipRow
        nextDisabled={isSaving}
        skipDisabled={isSaving}
        nextLabel="Yes"
        skipLabel="Skipped"
        onNext={() => void finishNoDeleted()}
        onSkip={() => void finishNoDeleted()}
      />
      <div className="rw-next-skip-row rw-next-skip-single">
        <button
          type="button"
          className="btn-ghost rw-skip"
          disabled={isSaving}
          onClick={() => persist(SKIP_FINISH_PAYLOAD)}
        >
          Skip workflow
        </button>
      </div>
    </div>
  )
}

function Step6Finished({
  row,
  copyText,
}: {
  row: ReviewWorkflowRow
  copyText: (t: string) => Promise<void>
}) {
  const summary = useMemo(() => {
    if (row.lowRatingReason.trim()) {
      return row.lowRatingReason
    }
    return LOREM
  }, [row.lowRatingReason])

  const badge = useMemo(() => {
    const s = row.status.trim().toLowerCase()
    if (s.includes('5 stars')) {
      return { className: 'rw-badge rw-badge-blue', label: 'Closed — 5 stars review' }
    }
    if (s.includes('deleted') && !s.includes('no deleted')) {
      return { className: 'rw-badge rw-badge-green', label: row.status }
    }
    if (s.includes('no deleted')) {
      return { className: 'rw-badge rw-badge-amber', label: row.status }
    }
    return { className: 'rw-badge rw-badge-neutral', label: row.status || 'Finished' }
  }, [row.status])

  return (
    <div className="rw-step-inner rw-step-inner-center">
      <p className="rw-actions-title">Summary</p>
      <div className="rw-summary-card">
        <p className="rw-summary-text">{summary}</p>
        <p className="rw-field-label rw-muted">LowRatingReason</p>
        <p className="rw-meta-text">
          {row.lowRatingReason.trim() ? row.lowRatingReason : '—'}
        </p>
        <button
          type="button"
          className="btn-secondary rw-copy-summary"
          onClick={() => copyText(summary)}
        >
          Copy summary
        </button>
      </div>
      <span className={badge.className}>{badge.label}</span>
    </div>
  )
}
