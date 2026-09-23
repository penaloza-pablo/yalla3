import { YallaSwitch } from '../bookings/YallaSwitch'
import type { AgentDraft } from './form'
import type { AgentToolInfo } from './types'

type AgentConfigFormProps = {
  draft: AgentDraft
  tools: AgentToolInfo[]
  models: string[]
  isNew: boolean
  isSaving: boolean
  labels: {
    name: string
    purpose: string
    purposeHelp: string
    enabled: string
    enabledOn: string
    enabledOff: string
    model: string
    modelHelp: string
    coverage: string
    coverageHelp: string
    coverageTool: string
    coverageMention: string
    paragraphs: string
    paragraphsHelp: string
    instructions: string
    instructionsHelp: string
    rules: string
    rulesHelp: string
    addRule: string
    removeRule: string
    tools: string
    toolsHelp: string
    noTools: string
    limits: string
    maxTurns: string
    maxToolCalls: string
    maxCostUsd: string
    timeoutMs: string
    save: string
    saving: string
    cancel: string
  }
  onChange: (draft: AgentDraft) => void
  onSave: () => void
  onCancel: () => void
}

export function AgentConfigForm({
  draft,
  tools,
  models,
  isNew,
  isSaving,
  labels,
  onChange,
  onSave,
  onCancel,
}: AgentConfigFormProps) {
  const modelOptions = models.includes(draft.model)
    ? models
    : draft.model
      ? [draft.model, ...models]
      : models

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <label>
        {labels.name}
        <input
          value={draft.name}
          onChange={(event) =>
            onChange({ ...draft, name: event.target.value })
          }
          required
          maxLength={80}
        />
      </label>
      <div className="planner-switch compact">
        <YallaSwitch
          on={draft.enabled}
          disabled={isSaving}
          label={draft.enabled ? labels.enabledOn : labels.enabledOff}
          onToggle={() => onChange({ ...draft, enabled: !draft.enabled })}
        />
        <span>{labels.enabled}</span>
      </div>
      <label className="form-field-span">
        {labels.purpose}
        <textarea
          value={draft.purpose}
          onChange={(event) =>
            onChange({ ...draft, purpose: event.target.value })
          }
          rows={2}
          maxLength={400}
        />
        <span className="card-subtitle">{labels.purposeHelp}</span>
      </label>
      <label>
        {labels.model}
        <select
          value={draft.model}
          onChange={(event) =>
            onChange({ ...draft, model: event.target.value })
          }
        >
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <span className="card-subtitle">{labels.modelHelp}</span>
      </label>
      <label>
        {labels.coverage}
        <select
          value={draft.coverageType}
          onChange={(event) =>
            onChange({
              ...draft,
              coverageType: event.target.value as AgentDraft['coverageType'],
            })
          }
        >
          <option value="tool_declared">{labels.coverageTool}</option>
          <option value="mention_in_output">{labels.coverageMention}</option>
        </select>
        <span className="card-subtitle">{labels.coverageHelp}</span>
      </label>
      {draft.coverageType === 'mention_in_output' ? (
        <label>
          {labels.paragraphs}
          <input
            type="number"
            min={0}
            max={12}
            value={draft.expectedParagraphs}
            onChange={(event) =>
              onChange({ ...draft, expectedParagraphs: event.target.value })
            }
          />
          <span className="card-subtitle">{labels.paragraphsHelp}</span>
        </label>
      ) : null}
      <label className="form-field-span">
        {labels.instructions}
        <textarea
          className="agents-instructions-input"
          value={draft.instructions}
          onChange={(event) =>
            onChange({ ...draft, instructions: event.target.value })
          }
          rows={12}
        />
        <span className="card-subtitle">{labels.instructionsHelp}</span>
      </label>
      <div className="form-field-span">
        <p className="agents-coverage-title">{labels.rules}</p>
        <p className="card-subtitle">{labels.rulesHelp}</p>
        <div className="agents-rules-editor">
          {draft.rules.map((rule, index) => (
            <div className="agents-rule-row" key={`rule-${index}`}>
              <input
                value={rule}
                onChange={(event) => {
                  const next = [...draft.rules]
                  next[index] = event.target.value
                  onChange({ ...draft, rules: next })
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  onChange({
                    ...draft,
                    rules: draft.rules.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                aria-label={labels.removeRule}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange({ ...draft, rules: [...draft.rules, ''] })}
          >
            {labels.addRule}
          </button>
        </div>
      </div>
      <div className="form-field-span">
        <p className="agents-coverage-title">{labels.tools}</p>
        <p className="card-subtitle">{labels.toolsHelp}</p>
        {tools.length === 0 ? (
          <p className="card-subtitle">{labels.noTools}</p>
        ) : (
          <div className="checkbox-list">
            {tools.map((tool) => (
              <label className="filter-option" key={tool.name}>
                <input
                  type="checkbox"
                  checked={draft.allowedTools.includes(tool.name)}
                  onChange={() => {
                    const selected = draft.allowedTools.includes(tool.name)
                      ? draft.allowedTools.filter((name) => name !== tool.name)
                      : [...draft.allowedTools, tool.name]
                    onChange({ ...draft, allowedTools: selected })
                  }}
                />
                <span>
                  <strong>{tool.name}</strong>
                  <span className="card-subtitle"> {tool.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="form-field-span">
        <p className="agents-coverage-title">{labels.limits}</p>
        <div className="agents-limits-grid">
          <label>
            {labels.maxTurns}
            <input
              type="number"
              min={1}
              max={20}
              value={draft.maxTurns}
              onChange={(event) =>
                onChange({ ...draft, maxTurns: event.target.value })
              }
            />
          </label>
          <label>
            {labels.maxToolCalls}
            <input
              type="number"
              min={1}
              max={40}
              value={draft.maxToolCalls}
              onChange={(event) =>
                onChange({ ...draft, maxToolCalls: event.target.value })
              }
            />
          </label>
          <label>
            {labels.maxCostUsd}
            <input
              type="number"
              min={0.01}
              max={20}
              step={0.01}
              value={draft.maxCostUsd}
              onChange={(event) =>
                onChange({ ...draft, maxCostUsd: event.target.value })
              }
            />
          </label>
          <label>
            {labels.timeoutMs}
            <input
              type="number"
              min={5000}
              max={110000}
              step={1000}
              value={draft.timeoutMs}
              onChange={(event) =>
                onChange({ ...draft, timeoutMs: event.target.value })
              }
            />
          </label>
        </div>
      </div>
      <div className="form-field-span agents-form-actions">
        {isNew ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            {labels.cancel}
          </button>
        ) : null}
        <button className="btn-primary" type="submit" disabled={isSaving || !draft.name.trim()}>
          {isSaving ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  )
}
