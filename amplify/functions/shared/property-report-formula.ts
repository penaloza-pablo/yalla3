import type { BusinessModel } from './property-report-settings';

export const DEFAULT_COMMISSION_FORMULA =
  '(paidByGuest - payoutCleaningGross) * commission / 100';

export const DEFAULT_PROPERTY_CONTRIBUTION_FORMULA =
  '(income - payoutCleaningNet) - (cleaningNet + cleaningKit) - maintenanceNet - managementFee - markup - expensesAndServices';

export type FormulaTarget =
  | 'managementFee'
  | 'propertyContribution'
  | 'ourProfit'
  | 'netEarnings';

export const FORMULA_CATALOG_VARIABLES = [
  'paidByGuest',
  'otherIncomesNet',
  'payoutCleaningNet',
  'payoutCleaningGross',
  'cleaningFee',
  'cleaningPayoutVat',
  'accommodationGross',
  'accommodationPayoutVat',
  'accommodationNet',
  'cleaningNet',
  'cleaningKit',
  'cleaningIva',
  'maintenanceNet',
  'maintenanceIva',
  'servicesNet',
  'servicesIva',
  'otherExpensesNet',
  'otherExpensesIva',
  'otherIncomesIva',
  'bookingCount',
  'income',
  'cleaningMargin',
  'maintenance',
  'maintenanceCoverByOwner',
  'maintenanceCoverByUs',
  'markup',
  'iva',
  'expensesAndServices',
] as const;

export type FormulaCatalogVariable = (typeof FORMULA_CATALOG_VARIABLES)[number];

export const FORMULA_RESULT_VARIABLES = [
  'managementFee',
  'propertyContribution',
  'ourProfit',
  'netEarnings',
] as const;

export const VISIBILITY_METRIC_IDS = [
  ...FORMULA_CATALOG_VARIABLES,
  ...FORMULA_RESULT_VARIABLES,
] as const;

export type VisibilityMetricId = (typeof VISIBILITY_METRIC_IDS)[number];

const TARGET_EXTRA_VARIABLES: Record<FormulaTarget, readonly string[]> = {
  managementFee: [],
  propertyContribution: ['managementFee'],
  ourProfit: ['managementFee', 'propertyContribution'],
  netEarnings: ['managementFee', 'propertyContribution', 'ourProfit'],
};

export type FormulaToken =
  | { kind: 'number'; raw: string }
  | { kind: 'ident'; raw: string }
  | { kind: 'op'; raw: string };

export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

const OPERATORS = new Set(['+', '-', '*', '/', '(', ')']);

export const allowedFormulaVariables = (
  model: BusinessModel | '',
  target: FormulaTarget = 'managementFee',
): string[] => {
  const extras = [...TARGET_EXTRA_VARIABLES[target]];
  if (model === 'commission') {
    return [...FORMULA_CATALOG_VARIABLES, 'commission', ...extras];
  }
  if (model === 'fixedRent') {
    return [...FORMULA_CATALOG_VARIABLES, 'fixedRent', ...extras];
  }
  return [...FORMULA_CATALOG_VARIABLES, ...extras];
};

const isIdentStart = (char: string) => /[A-Za-z]/.test(char);
const isIdentPart = (char: string) => /[A-Za-z0-9]/.test(char);
const isDigit = (char: string) => /[0-9.]/.test(char);

export const tokenizeFormula = (
  source: string,
): { ok: true; tokens: FormulaToken[] } | { ok: false; message: string } => {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === ' ' || char === '\t' || char === '\n') {
      index += 1;
      continue;
    }
    if (OPERATORS.has(char)) {
      tokens.push({ kind: 'op', raw: char });
      index += 1;
      continue;
    }
    if (isIdentStart(char)) {
      let raw = char;
      index += 1;
      while (index < source.length && isIdentPart(source[index])) {
        raw += source[index];
        index += 1;
      }
      tokens.push({ kind: 'ident', raw });
      continue;
    }
    if (char === '.' || (char >= '0' && char <= '9')) {
      let raw = '';
      let dots = 0;
      while (index < source.length && isDigit(source[index])) {
        if (source[index] === '.') {
          dots += 1;
          if (dots > 1) {
            return { ok: false, message: 'Invalid number in formula.' };
          }
        }
        raw += source[index];
        index += 1;
      }
      if (raw === '.' || !Number.isFinite(Number(raw))) {
        return { ok: false, message: 'Invalid number in formula.' };
      }
      tokens.push({ kind: 'number', raw });
      continue;
    }
    return { ok: false, message: `Unexpected character "${char}" in formula.` };
  }
  return { ok: true, tokens };
};

export const joinFormulaTokens = (tokens: FormulaToken[]) =>
  tokens.map((token) => token.raw).join(' ');

const peek = (tokens: FormulaToken[], index: number) => tokens[index];

const parseExpression = (
  tokens: FormulaToken[],
  values: Record<string, number>,
): FormulaResult => {
  let index = 0;

  const fail = (message: string): FormulaResult => ({ ok: false, message });

  const parsePrimary = (): FormulaResult => {
    const token = peek(tokens, index);
    if (!token) {
      return fail('Formula is incomplete.');
    }
    if (token.kind === 'number') {
      index += 1;
      return { ok: true, value: Number(token.raw) };
    }
    if (token.kind === 'ident') {
      index += 1;
      if (!Object.prototype.hasOwnProperty.call(values, token.raw)) {
        return fail(`Unknown formula variable "${token.raw}".`);
      }
      const value = values[token.raw];
      if (!Number.isFinite(value)) {
        return fail(`Formula variable "${token.raw}" has no numeric value.`);
      }
      return { ok: true, value };
    }
    if (token.kind === 'op' && token.raw === '(') {
      index += 1;
      const inner = parseAdd();
      if (!inner.ok) {
        return inner;
      }
      const close = peek(tokens, index);
      if (!close || close.kind !== 'op' || close.raw !== ')') {
        return fail('Missing closing parenthesis.');
      }
      index += 1;
      return inner;
    }
    return fail('Formula is incomplete.');
  };

  const parseUnary = (): FormulaResult => {
    const token = peek(tokens, index);
    if (token?.kind === 'op' && token.raw === '-') {
      index += 1;
      const inner = parseUnary();
      if (!inner.ok) {
        return inner;
      }
      return { ok: true, value: -inner.value };
    }
    if (token?.kind === 'op' && token.raw === '+') {
      index += 1;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parseMul = (): FormulaResult => {
    let left = parseUnary();
    if (!left.ok) {
      return left;
    }
    while (true) {
      const token = peek(tokens, index);
      if (!token || token.kind !== 'op' || (token.raw !== '*' && token.raw !== '/')) {
        return left;
      }
      index += 1;
      const right = parseUnary();
      if (!right.ok) {
        return right;
      }
      if (token.raw === '/' && right.value === 0) {
        return fail('Division by zero in formula.');
      }
      left = {
        ok: true,
        value: token.raw === '*' ? left.value * right.value : left.value / right.value,
      };
    }
  };

  const parseAdd = (): FormulaResult => {
    let left = parseMul();
    if (!left.ok) {
      return left;
    }
    while (true) {
      const token = peek(tokens, index);
      if (!token || token.kind !== 'op' || (token.raw !== '+' && token.raw !== '-')) {
        return left;
      }
      index += 1;
      const right = parseMul();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        value: token.raw === '+' ? left.value + right.value : left.value - right.value,
      };
    }
  };

  if (tokens.length === 0) {
    return fail('Formula is required.');
  }
  const result = parseAdd();
  if (!result.ok) {
    return result;
  }
  if (index !== tokens.length) {
    return fail('Formula has leftover tokens.');
  }
  if (!Number.isFinite(result.value)) {
    return fail('Formula did not produce a number.');
  }
  return result;
};

export const validateFormula = (
  source: string,
  model: BusinessModel | '',
  target: FormulaTarget = 'managementFee',
): { ok: true; tokens: FormulaToken[] } | { ok: false; message: string } => {
  const trimmed = source.trim();
  if (!trimmed) {
    return { ok: false, message: 'Formula is required.' };
  }
  const tokenized = tokenizeFormula(trimmed);
  if (!tokenized.ok) {
    return tokenized;
  }
  const allowed = new Set(allowedFormulaVariables(model, target));
  for (const token of tokenized.tokens) {
    if (token.kind === 'ident' && !allowed.has(token.raw)) {
      if (token.raw === target || token.raw === 'netProfit') {
        return {
          ok: false,
          message: `"${token.raw}" cannot be used inside its own formula.`,
        };
      }
      if (token.raw === 'commission' || token.raw === 'fixedRent') {
        return {
          ok: false,
          message: `Variable "${token.raw}" is not available for this business model.`,
        };
      }
      return { ok: false, message: `Unknown formula variable "${token.raw}".` };
    }
  }
  const sample: Record<string, number> = {};
  for (const name of allowed) {
    sample[name] = 1;
  }
  const parsed = parseExpression(tokenized.tokens, sample);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, tokens: tokenized.tokens };
};

export const evaluateFormula = (
  source: string,
  values: Record<string, number>,
): FormulaResult => {
  const tokenized = tokenizeFormula(source.trim());
  if (!tokenized.ok) {
    return tokenized;
  }
  return parseExpression(tokenized.tokens, values);
};
