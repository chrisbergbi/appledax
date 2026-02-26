/**
 * Rule: unknown-function
 *
 * Detects identifiers followed by ( that are not recognized DAX functions.
 * The lexer classifies known functions as TokenType.Function; unknown ones
 * become TokenType.Identifier. So Identifier + OpenParen = unknown function call.
 *
 * Also handles dot-functions like STDEV.S( which tokenize as
 * Identifier("STDEV") Operator(".") Identifier("S") OpenParen.
 *
 * Excludes:
 *  - VAR-declared identifiers (they're variables, not function calls)
 *  - Names in the deprecated function map (handled by deprecated-function rule)
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, collectVarNames, tryParseDotFunction } from './_utils';
import { getAllFunctionNames } from '../../knowledge/lookup';
import { findClosestFunction } from '../../knowledge/fuzzy-match';
import { isDeprecated } from '../../knowledge/deprecated';

const KNOWN_FUNCTIONS = new Set(getAllFunctionNames().map((n) => n.toUpperCase()));

export const unknownFunction = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);
  const varNames = collectVarNames(nonWS);

  for (let i = 0; i < nonWS.length; i++) {
    // Check for dot-function pattern: ID.ID(
    const dotFn = tryParseDotFunction(nonWS, i);
    if (dotFn) {
      const upper = dotFn.name.toUpperCase();
      if (!KNOWN_FUNCTIONS.has(upper) && !isDeprecated(upper)) {
        const suggestion = findClosestFunction(dotFn.name);
        diagnostics.push({
          severity: 'error',
          message: suggestion
            ? t('lint.unknown_function', { name: dotFn.name, suggestion })
            : t('lint.unknown_function_no_suggestion', { name: dotFn.name }),
          startLine: dotFn.startToken.line,
          startCol: dotFn.startToken.col,
          endLine: dotFn.endToken.endLine,
          endCol: dotFn.endToken.endCol,
          ruleId: 'unknown-function',
          quickFix: suggestion ? {
            title: t('qf.replace_function', { name: suggestion }),
            edits: [{
              range: {
                startLine: dotFn.startToken.line,
                startCol: dotFn.startToken.col,
                endLine: dotFn.endToken.endLine,
                endCol: dotFn.endToken.endCol,
              },
              text: suggestion,
            }],
          } : undefined,
        });
      }
      i += 3; // Skip past the dot-function tokens
      continue;
    }

    // Check for simple pattern: Identifier(
    if (
      nonWS[i].type === TokenType.Identifier &&
      i + 1 < nonWS.length &&
      nonWS[i + 1].type === TokenType.OpenParen
    ) {
      const name = nonWS[i].value;
      const upper = name.toUpperCase();

      // Skip VAR-declared names
      if (varNames.has(upper)) continue;

      // Skip deprecated functions (handled by another rule)
      if (isDeprecated(upper)) continue;

      // Skip known functions (shouldn't be Identifier, but just in case)
      if (KNOWN_FUNCTIONS.has(upper)) continue;

      const suggestion = findClosestFunction(name);
      diagnostics.push({
        severity: 'error',
        message: suggestion
          ? t('lint.unknown_function', { name, suggestion })
          : t('lint.unknown_function_no_suggestion', { name }),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i].endLine,
        endCol: nonWS[i].endCol,
        ruleId: 'unknown-function',
        quickFix: suggestion ? {
          title: t('qf.replace_function', { name: suggestion }),
          edits: [{
            range: {
              startLine: nonWS[i].line,
              startCol: nonWS[i].col,
              endLine: nonWS[i].endLine,
              endCol: nonWS[i].endCol,
            },
            text: suggestion,
          }],
        } : undefined,
      });
    }
  }

  return diagnostics;
};
