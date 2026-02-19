import { StreamLanguage, StringStream } from '@codemirror/language';
import { getAllFunctionNames } from '../../knowledge/lookup';

/**
 * DAX syntax highlighting via CM6 StreamLanguage.
 * Mirrors the token types from the Monarch tokenizer.
 */

const keywords = new Set([
  'VAR', 'RETURN', 'TRUE', 'FALSE', 'BLANK',
  'IN', 'NOT', 'DEFINE', 'MEASURE', 'EVALUATE',
  'ORDER', 'BY', 'ASC', 'DESC', 'TABLE', 'COLUMN',
  'START', 'AT', 'AND', 'OR',
]);

let functions: Set<string> | null = null;

function getFunctions(): Set<string> {
  if (!functions) {
    functions = new Set(getAllFunctionNames().map((f) => f.toUpperCase()));
  }
  return functions;
}

interface DaxState {
  /** Current parsing context: 'root' | 'blockComment' | 'string' | 'tableRef' | 'columnRef' */
  context: string;
}

function tokenBase(stream: StringStream, state: DaxState): string | null {
  // Block comment
  if (stream.match('/*')) {
    state.context = 'blockComment';
    return 'blockComment';
  }

  // Line comment
  if (stream.match('//')) {
    stream.skipToEnd();
    return 'lineComment';
  }

  // Date literal dt"..."
  if (stream.match(/^dt"/i)) {
    while (!stream.eol()) {
      if (stream.next() === '"') break;
    }
    return 'number';
  }

  // String (double-quoted)
  if (stream.eat('"')) {
    state.context = 'string';
    return 'string';
  }

  // Table reference (single-quoted)
  if (stream.eat("'")) {
    state.context = 'tableRef';
    return 'typeName';
  }

  // Column reference [...]
  if (stream.eat('[')) {
    state.context = 'columnRef';
    return 'variableName';
  }

  // Numbers
  if (stream.match(/^\d+(\.\d+)?([eE][-+]?\d+)?/)) {
    return 'number';
  }

  // Identifiers (keywords, functions, plain)
  if (stream.match(/^[a-zA-Z_]\w*/)) {
    const word = stream.current().toUpperCase();
    if (keywords.has(word)) return 'keyword';
    if (getFunctions().has(word)) return 'function(definition)';
    return 'name';
  }

  // Multi-char operators
  if (stream.match(/^(<>|<=|>=|&&|\|\|)/)) {
    return 'operator';
  }

  // Single-char operators
  if (stream.match(/^[+\-*/^=<>&]/)) {
    return 'operator';
  }

  // Parentheses
  if (stream.match(/^[()]/)) {
    return 'paren';
  }

  // Comma
  if (stream.eat(',')) {
    return 'separator';
  }

  // Skip any other character
  stream.next();
  return null;
}

function tokenBlockComment(stream: StringStream, state: DaxState): string {
  while (!stream.eol()) {
    if (stream.match('*/')) {
      state.context = 'root';
      return 'blockComment';
    }
    stream.next();
  }
  return 'blockComment';
}

function tokenString(stream: StringStream, state: DaxState): string {
  while (!stream.eol()) {
    const ch = stream.next();
    if (ch === '"') {
      if (stream.eat('"')) {
        // Escaped quote ""
        continue;
      }
      state.context = 'root';
      return 'string';
    }
  }
  return 'string';
}

function tokenTableRef(stream: StringStream, state: DaxState): string {
  while (!stream.eol()) {
    const ch = stream.next();
    if (ch === "'") {
      if (stream.eat("'")) {
        // Escaped quote ''
        continue;
      }
      state.context = 'root';
      return 'typeName';
    }
  }
  return 'typeName';
}

function tokenColumnRef(stream: StringStream, state: DaxState): string {
  while (!stream.eol()) {
    if (stream.next() === ']') {
      state.context = 'root';
      return 'variableName';
    }
  }
  return 'variableName';
}

export const daxLanguage = StreamLanguage.define<DaxState>({
  name: 'dax',

  startState(): DaxState {
    return { context: 'root' };
  },

  token(stream: StringStream, state: DaxState): string | null {
    if (stream.eatSpace()) return null;

    switch (state.context) {
      case 'blockComment': return tokenBlockComment(stream, state);
      case 'string': return tokenString(stream, state);
      case 'tableRef': return tokenTableRef(stream, state);
      case 'columnRef': return tokenColumnRef(stream, state);
      default: return tokenBase(stream, state);
    }
  },

  blankLine(state: DaxState): void {
    // Keep context across blank lines (important for block comments)
    void state;
  },

  copyState(state: DaxState): DaxState {
    return { ...state };
  },

  indent(): null {
    return null;
  },

  languageData: {
    commentTokens: {
      line: '//',
      block: { open: '/*', close: '*/' },
    },
    closeBrackets: {
      brackets: ['(', '"', "'", '['],
    },
  },
});
