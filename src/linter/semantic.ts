import type { Token } from '../types';
import { TokenType } from '../types';
import { filterNonWS, tryParseDotFunction } from './rules/_utils';

export interface SemanticArg {
  tokens: Token[];
  startIdx: number;
  endIdx: number;
}

export interface SemanticFunctionCall {
  name: string;
  nameStartToken: Token;
  nameEndToken: Token;
  openParenToken: Token;
  closeParenToken: Token;
  openParenIdx: number;
  closeParenIdx: number;
  args: SemanticArg[];
  parentCallIndex: number | null;
}

export interface SemanticVarBinding {
  name: string;
  nameToken: Token;
  varToken: Token;
  scopeEndIdx: number;
}

export interface SemanticModel {
  nonWS: Token[];
  functionCalls: SemanticFunctionCall[];
  functionCallsByName: Map<string, SemanticFunctionCall[]>;
  varBindings: SemanticVarBinding[];
}

const ITERATOR_FUNCTIONS = new Set([
  'SUMX', 'AVERAGEX', 'MINX', 'MAXX', 'COUNTAX', 'COUNTX',
  'RANKX', 'PRODUCTX', 'CONCATENATEX',
  'FILTER', 'ADDCOLUMNS', 'SELECTCOLUMNS',
  'GENERATE', 'GENERATEALL',
]);

export function isIteratorFunction(name: string): boolean {
  return ITERATOR_FUNCTIONS.has(name.toUpperCase());
}

export function buildSemanticModel(tokens: Token[]): SemanticModel {
  const nonWS = filterNonWS(tokens);
  const functionCalls = collectFunctionCalls(nonWS);
  const functionCallsByName = new Map<string, SemanticFunctionCall[]>();
  for (const call of functionCalls) {
    const key = call.name.toUpperCase();
    const list = functionCallsByName.get(key) ?? [];
    list.push(call);
    functionCallsByName.set(key, list);
  }

  return {
    nonWS,
    functionCalls,
    functionCallsByName,
    varBindings: collectVarBindings(nonWS),
  };
}

export function findEnclosingCall(
  model: SemanticModel,
  tokenIdx: number,
  predicate: (call: SemanticFunctionCall) => boolean,
): SemanticFunctionCall | null {
  let best: SemanticFunctionCall | null = null;
  for (const call of model.functionCalls) {
    if (!predicate(call)) continue;
    if (call.openParenIdx < tokenIdx && call.closeParenIdx > tokenIdx) {
      if (!best || call.openParenIdx > best.openParenIdx) {
        best = call;
      }
    }
  }
  return best;
}

function collectFunctionCalls(nonWS: Token[]): SemanticFunctionCall[] {
  const calls: SemanticFunctionCall[] = [];

  for (let i = 0; i < nonWS.length; i++) {
    let name: string | null = null;
    let nameStartToken: Token | null = null;
    let nameEndToken: Token | null = null;
    let openParenIdx = -1;
    let consumed = 0;

    const dotFn = tryParseDotFunction(nonWS, i);
    if (dotFn) {
      name = dotFn.name.toUpperCase();
      nameStartToken = dotFn.startToken;
      nameEndToken = dotFn.endToken;
      openParenIdx = dotFn.parenIdx;
      consumed = 3;
    } else if (
      nonWS[i].type === TokenType.Function &&
      i + 1 < nonWS.length &&
      nonWS[i + 1].type === TokenType.OpenParen
    ) {
      name = nonWS[i].value.toUpperCase();
      nameStartToken = nonWS[i];
      nameEndToken = nonWS[i];
      openParenIdx = i + 1;
    }

    if (!name || !nameStartToken || !nameEndToken) continue;

    const closeParenIdx = findMatchingCloseParen(nonWS, openParenIdx);
    if (closeParenIdx === -1) {
      if (consumed > 0) i += consumed;
      continue;
    }

    const args = parseArgs(nonWS, openParenIdx, closeParenIdx);
    calls.push({
      name,
      nameStartToken,
      nameEndToken,
      openParenToken: nonWS[openParenIdx],
      closeParenToken: nonWS[closeParenIdx],
      openParenIdx,
      closeParenIdx,
      args,
      parentCallIndex: null,
    });

    if (consumed > 0) i += consumed;
  }

  // Parent pointer: nearest call that strictly contains this call.
  for (let i = 0; i < calls.length; i++) {
    let parentIdx: number | null = null;
    for (let j = 0; j < calls.length; j++) {
      if (i === j) continue;
      const outer = calls[j];
      const inner = calls[i];
      if (outer.openParenIdx < inner.openParenIdx && outer.closeParenIdx > inner.closeParenIdx) {
        if (parentIdx === null || calls[parentIdx].openParenIdx < outer.openParenIdx) {
          parentIdx = j;
        }
      }
    }
    calls[i].parentCallIndex = parentIdx;
  }

  return calls;
}

function parseArgs(nonWS: Token[], openParenIdx: number, closeParenIdx: number): SemanticArg[] {
  if (closeParenIdx <= openParenIdx + 1) return [];

  const args: SemanticArg[] = [];
  let argStart = openParenIdx + 1;
  let depth = 0;

  for (let i = openParenIdx + 1; i < closeParenIdx; i++) {
    const tk = nonWS[i];
    if (tk.type === TokenType.OpenParen) {
      depth++;
      continue;
    }
    if (tk.type === TokenType.CloseParen) {
      depth--;
      continue;
    }

    if (tk.type === TokenType.Comma && depth === 0) {
      args.push(makeArg(nonWS, argStart, i - 1));
      argStart = i + 1;
    }
  }
  args.push(makeArg(nonWS, argStart, closeParenIdx - 1));
  return args;
}

function makeArg(nonWS: Token[], startIdx: number, endIdx: number): SemanticArg {
  if (endIdx < startIdx) return { tokens: [], startIdx, endIdx };
  return {
    tokens: nonWS.slice(startIdx, endIdx + 1),
    startIdx,
    endIdx,
  };
}

function findMatchingCloseParen(nonWS: Token[], openParenIdx: number): number {
  if (nonWS[openParenIdx]?.type !== TokenType.OpenParen) return -1;
  let depth = 1;
  for (let i = openParenIdx + 1; i < nonWS.length; i++) {
    if (nonWS[i].type === TokenType.OpenParen) depth++;
    if (nonWS[i].type === TokenType.CloseParen) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function collectVarBindings(nonWS: Token[]): SemanticVarBinding[] {
  const bindings: SemanticVarBinding[] = [];
  const depthBefore = computeDepthBefore(nonWS);

  for (let i = 0; i < nonWS.length - 1; i++) {
    const current = nonWS[i];
    const next = nonWS[i + 1];
    if (
      current.type !== TokenType.Keyword ||
      current.value.toUpperCase() !== 'VAR' ||
      next.type !== TokenType.Identifier
    ) {
      continue;
    }

    const baseDepth = depthBefore[i];
    let returnIdx = -1;
    for (let j = i + 2; j < nonWS.length; j++) {
      const tk = nonWS[j];
      if (
        tk.type === TokenType.Keyword &&
        tk.value.toUpperCase() === 'RETURN' &&
        depthBefore[j] === baseDepth
      ) {
        returnIdx = j;
        break;
      }
    }

    let scopeEndIdx = nonWS.length - 1;
    if (returnIdx !== -1) {
      for (let j = returnIdx + 1; j < nonWS.length; j++) {
        if (depthBefore[j] === baseDepth) {
          const tk = nonWS[j];
          if (tk.type === TokenType.Comma || tk.type === TokenType.CloseParen) {
            scopeEndIdx = j - 1;
            break;
          }
        }
        if (depthBefore[j] < baseDepth) {
          scopeEndIdx = j - 1;
          break;
        }
      }
    }

    bindings.push({
      name: next.value.toUpperCase(),
      nameToken: next,
      varToken: current,
      scopeEndIdx,
    });
  }

  return bindings;
}

function computeDepthBefore(nonWS: Token[]): number[] {
  const depthBefore: number[] = [];
  let depth = 0;
  for (let i = 0; i < nonWS.length; i++) {
    depthBefore.push(depth);
    if (nonWS[i].type === TokenType.OpenParen) depth++;
    if (nonWS[i].type === TokenType.CloseParen) depth = Math.max(0, depth - 1);
  }
  return depthBefore;
}
