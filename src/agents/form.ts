import type { AgentRecord } from './types'

export type AgentDraft = {
  id?: string
  name: string
  purpose: string
  instructions: string
  rules: string[]
  allowedTools: string[]
  model: string
  enabled: boolean
  coverageType: 'tool_declared' | 'mention_in_output'
  expectedParagraphs: string
}

export const emptyAgentDraft = (model: string): AgentDraft => ({
  name: '',
  purpose: '',
  instructions: '',
  rules: [''],
  allowedTools: [],
  model,
  enabled: true,
  coverageType: 'tool_declared',
  expectedParagraphs: '',
})

export const draftFromAgent = (agent: AgentRecord): AgentDraft => ({
  id: agent.id,
  name: agent.name,
  purpose: agent.purpose,
  instructions: agent.instructions,
  rules: agent.rules.length > 0 ? agent.rules : [''],
  allowedTools: [...agent.allowedTools],
  model: agent.model,
  enabled: agent.enabled,
  coverageType: agent.coveragePolicy?.type ?? 'tool_declared',
  expectedParagraphs:
    agent.coveragePolicy?.expectedParagraphs != null
      ? String(agent.coveragePolicy.expectedParagraphs)
      : '',
})
