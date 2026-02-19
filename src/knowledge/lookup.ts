import type { DaxFunction } from '../types';
import functionsData from './functions.json';
import { t } from '../i18n/index';

const functionMap = new Map<string, DaxFunction>();

for (const fn of functionsData as DaxFunction[]) {
  functionMap.set(fn.name.toUpperCase(), fn);
}

export function getFunctionByName(name: string): DaxFunction | undefined {
  return functionMap.get(name.toUpperCase());
}

export function getAllFunctions(): DaxFunction[] {
  return functionsData as DaxFunction[];
}

export function getAllFunctionNames(): string[] {
  return (functionsData as DaxFunction[]).map((f) => f.name);
}

const keywordKeys: Record<string, string> = {
  VAR: 'kw.var',
  RETURN: 'kw.return',
  TRUE: 'kw.true',
  FALSE: 'kw.false',
  BLANK: 'kw.blank',
  IN: 'kw.in',
  DEFINE: 'kw.define',
  MEASURE: 'kw.measure',
  EVALUATE: 'kw.evaluate',
  ORDER: 'kw.order',
  BY: 'kw.by',
  ASC: 'kw.asc',
  DESC: 'kw.desc',
  TABLE: 'kw.table',
  COLUMN: 'kw.column',
};

export function getKeywordHelp(name: string): string | undefined {
  const key = keywordKeys[name.toUpperCase()];
  return key ? t(key) : undefined;
}
