import * as monaco from 'monaco-editor';
import { getAllFunctionNames } from '../knowledge/lookup';

export function registerDaxLanguage(): void {
  monaco.languages.register({
    id: 'dax',
    extensions: ['.dax'],
    aliases: ['DAX', 'dax'],
    mimetypes: ['text/x-dax'],
  });

  monaco.languages.setLanguageConfiguration('dax', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '[', close: ']' },
      { open: '/*', close: ' */' },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '[', close: ']' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(VAR)\b/i,
      decreaseIndentPattern: /^\s*(RETURN)\b/i,
    },
  });

  const functionNames = getAllFunctionNames();

  monaco.languages.setMonarchTokensProvider('dax', {
    ignoreCase: true,

    keywords: [
      'VAR', 'RETURN', 'TRUE', 'FALSE', 'BLANK',
      'IN', 'NOT', 'DEFINE', 'MEASURE', 'EVALUATE',
      'ORDER', 'BY', 'ASC', 'DESC', 'TABLE', 'COLUMN',
      'START', 'AT',
    ],

    functions: functionNames,

    operators: [
      '&&', '||', '<>', '<=', '>=', '+', '-', '*', '/', '^', '=', '<', '>', '&',
    ],

    tokenizer: {
      root: [
        // Block comments
        [/\/\*/, 'comment', '@comment'],

        // Line comments
        [/\/\/.*$/, 'comment'],

        // Date/time literals: dt"..."
        [/dt"[^"]*"/, 'number.date'],

        // Strings (double-quoted)
        [/"/, 'string', '@string'],

        // Table references (single-quoted)
        [/'/, 'type.table', '@tableRef'],

        // Column/measure references [...]
        [/\[/, 'variable.column', '@columnRef'],

        // Numbers
        [/\d+(\.\d+)?([eE][-+]?\d+)?/, 'number'],

        // Identifiers (keywords vs functions vs plain)
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@functions': 'function',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],

        // Multi-character operators
        [/<>|<=|>=|&&|\|\|/, 'operator'],

        // Single-character operators
        [/[+\-*/^=<>&]/, 'operator'],

        // Parentheses
        [/[()]/, 'delimiter.parenthesis'],

        // Comma
        [/,/, 'delimiter.comma'],

        // Whitespace
        [/\s+/, 'white'],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],

      string: [
        [/[^"]+/, 'string'],
        [/""/, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],

      tableRef: [
        [/[^']+/, 'type.table'],
        [/''/, 'type.table.escape'],
        [/'/, 'type.table', '@pop'],
      ],

      columnRef: [
        [/[^\]]+/, 'variable.column'],
        [/\]/, 'variable.column', '@pop'],
      ],
    },
  } as monaco.languages.IMonarchLanguage);
}
