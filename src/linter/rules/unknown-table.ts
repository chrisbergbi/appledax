import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import * as store from '../../model/store';

export const unknownTable = (tokens: Token[]): LintDiagnostic[] => {
  const model = store.getModel();
  if (!model) return []; // Only active when model is loaded

  const diagnostics: LintDiagnostic[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.TableRef) {
      // Extract table name: strip surrounding quotes
      let name = token.value;
      if (name.startsWith("'") && name.endsWith("'")) {
        name = name.slice(1, -1).replace(/''/g, "'");
      }

      if (!name) continue;

      const table = store.getTable(name);
      if (!table) {
        diagnostics.push({
          severity: 'warning',
          message: t('lint.unknown_table', { name }),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'unknown-table',
        });
      }
    }
  }

  return diagnostics;
};
