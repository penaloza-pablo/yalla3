import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  joinFormulaTokens,
  tokenizeFormula,
  type FormulaToken,
} from '../../amplify/functions/shared/property-report-formula'

type Props = {
  value: string
  variableIds: string[]
  variableLabel: (id: string) => string
  onChange: (value: string) => void
}

const OPERATORS = ['+', '-', '*', '/', '(', ')'] as const

export function FormulaBuilder({
  value,
  variableIds,
  variableLabel,
  onChange,
}: Props) {
  const { t } = useTranslation()
  const [selectedVariable, setSelectedVariable] = useState(variableIds[0] ?? '')
  const [numberDraft, setNumberDraft] = useState('')

  useEffect(() => {
    if (!variableIds.includes(selectedVariable)) {
      setSelectedVariable(variableIds[0] ?? '')
    }
  }, [selectedVariable, variableIds])

  const tokens = useMemo(() => {
    if (!value.trim()) {
      return [] as FormulaToken[]
    }
    const parsed = tokenizeFormula(value)
    return parsed.ok ? parsed.tokens : ([{ kind: 'ident', raw: value }] as FormulaToken[])
  }, [value])

  const emit = (next: FormulaToken[]) => {
    onChange(joinFormulaTokens(next))
  }

  const addToken = (token: FormulaToken) => {
    emit([...tokens, token])
  }

  const addNumber = () => {
    const raw = numberDraft.trim()
    if (!raw || !Number.isFinite(Number(raw))) {
      return
    }
    addToken({ kind: 'number', raw })
    setNumberDraft('')
  }

  const addVariable = () => {
    if (!selectedVariable) {
      return
    }
    addToken({ kind: 'ident', raw: selectedVariable })
  }

  return (
    <div className="formula-builder">
      <div className="formula-canvas" aria-label={t('propertyReports.formula')}>
        {tokens.length === 0 ? (
          <span className="formula-placeholder">
            {t('propertyReports.formulaEmpty')}
          </span>
        ) : (
          tokens.map((token, index) => (
            <button
              key={`${token.kind}-${token.raw}-${index}`}
              className={`formula-chip is-${token.kind}`}
              type="button"
              title={t('propertyReports.formulaRemoveToken')}
              onClick={() => emit(tokens.filter((_, itemIndex) => itemIndex !== index))}
            >
              {token.kind === 'ident' ? variableLabel(token.raw) : token.raw}
            </button>
          ))
        )}
      </div>
      <div className="formula-toolbar">
        <label className="formula-tool">
          <span>{t('propertyReports.formulaVariable')}</span>
          <select
            value={selectedVariable}
            onChange={(event) => setSelectedVariable(event.target.value)}
          >
            {variableIds.map((id) => (
              <option key={id} value={id}>
                {variableLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary" type="button" onClick={addVariable}>
          {t('propertyReports.formulaAddVariable')}
        </button>
        <label className="formula-tool formula-tool-number">
          <span>{t('propertyReports.formulaNumber')}</span>
          <input
            type="number"
            step="any"
            value={numberDraft}
            onChange={(event) => setNumberDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addNumber()
              }
            }}
          />
        </label>
        <button className="btn-secondary" type="button" onClick={addNumber}>
          {t('propertyReports.formulaAddNumber')}
        </button>
        <div className="formula-ops" role="group" aria-label={t('propertyReports.formulaOperators')}>
          {OPERATORS.map((op) => (
            <button
              key={op}
              className="formula-op"
              type="button"
              onClick={() => addToken({ kind: 'op', raw: op })}
            >
              {op}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
