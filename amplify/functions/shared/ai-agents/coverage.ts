import type {
  AgentCoverage,
  AgentFinding,
  CoverageItem,
  CoveragePolicy,
  ToolCoverageHint,
} from './types';

const emptyCoverage = (): AgentCoverage => ({
  planned: [],
  reviewed: [],
  unchecked: [],
});

const mergeCoverageHints = (hints: ToolCoverageHint[]): AgentCoverage => {
  const coverage = emptyCoverage();
  const plannedIds = new Set<string>();
  const uncheckedIds = new Set<string>();
  for (const hint of hints) {
    for (const item of hint.planned) {
      if (plannedIds.has(item.id)) {
        continue;
      }
      plannedIds.add(item.id);
      coverage.planned.push(item);
    }
    for (const item of hint.unchecked) {
      if (uncheckedIds.has(item.id)) {
        continue;
      }
      uncheckedIds.add(item.id);
      coverage.unchecked.push(item);
    }
  }
  return coverage;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mentionedInText = (text: string, label: string) => {
  const normalized = label.trim();
  if (!normalized || !text.trim()) {
    return false;
  }
  const haystack = text.normalize('NFC');
  if (haystack.includes(normalized)) {
    return true;
  }
  const firstName = normalized.split(/\s+/)[0] ?? '';
  if (firstName.length < 2) {
    return false;
  }
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(firstName)}([^\\p{L}\\p{N}]|$)`, 'iu');
  return pattern.test(haystack);
};

export const applyCoveragePolicy = (
  policy: CoveragePolicy,
  hints: ToolCoverageHint[],
  outputText: string,
): AgentCoverage => {
  const merged = mergeCoverageHints(hints);
  if (policy.type !== 'mention_in_output') {
    merged.reviewed = merged.planned.map((item) => ({
      ...item,
      reason: 'Returned by an allowed tool.',
    }));
    return merged;
  }

  const reviewed: CoverageItem[] = [];
  const missing: CoverageItem[] = [];
  for (const item of merged.planned) {
    if (mentionedInText(outputText, item.label)) {
      reviewed.push({
        ...item,
        reason: 'Named in the agent output.',
      });
    } else {
      missing.push({
        ...item,
        reason: 'Not named in the agent output.',
      });
    }
  }
  return {
    planned: merged.planned,
    reviewed,
    unchecked: [...merged.unchecked, ...missing],
  };
};

export const findingsFromCoverage = (
  coverage: AgentCoverage,
  outputText: string,
): AgentFinding[] => {
  const findings: AgentFinding[] = [];
  if (coverage.planned.length === 0) {
    findings.push({
      severity: 'info',
      title: 'Nothing to review',
      detail: 'The allowed tools did not return any items for today.',
    });
    return findings;
  }
  const unnamed = coverage.unchecked.filter(
    (item) => item.reason === 'Not named in the agent output.',
  );
  if (unnamed.length > 0) {
    findings.push({
      severity: 'warning',
      title: 'Guests missing from the story',
      detail: unnamed.map((item) => item.label).join(', '),
    });
  } else if (coverage.reviewed.length > 0) {
    findings.push({
      severity: 'info',
      title: 'All planned guests were named',
      detail: `${coverage.reviewed.length} guest(s) mentioned in the output.`,
    });
  }
  const paragraphs = outputText
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (outputText.trim() && paragraphs.length !== 3) {
    findings.push({
      severity: 'warning',
      title: 'Story is not three paragraphs',
      detail: `The output has ${paragraphs.length} paragraph(s).`,
    });
  }
  return findings;
};
