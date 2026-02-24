import { Token, TokenType } from '../types';
import { getAllFunctionNames } from '../knowledge/lookup';

const KEYWORDS = new Set([
  'VAR', 'RETURN', 'TRUE', 'FALSE', 'BLANK',
  'IN', 'NOT', 'DEFINE', 'MEASURE', 'EVALUATE',
  'ORDER', 'BY', 'ASC', 'DESC', 'TABLE', 'COLUMN',
  'START', 'AT', 'AND', 'OR',
]);

const FUNCTIONS = new Set(getAllFunctionNames().map((n) => n.toUpperCase()));

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;
  const len = source.length;

  function peek(offset = 0): string {
    return pos + offset < len ? source[pos + offset] : '';
  }

  function advance(): string {
    const ch = source[pos];
    pos++;
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function pushToken(type: TokenType, value: string, startLine: number, startCol: number): void {
    tokens.push({ type, value, line: startLine, col: startCol, endLine: line, endCol: col });
  }

  while (pos < len) {
    const startLine = line;
    const startCol = col;
    const startPos = pos;
    const ch = peek();

    // Whitespace
    if (/\s/.test(ch)) {
      while (pos < len && /\s/.test(peek())) {
        advance();
      }
      pushToken(TokenType.Whitespace, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Line comment //
    if (ch === '/' && peek(1) === '/') {
      while (pos < len && peek() !== '\n') {
        advance();
      }
      pushToken(TokenType.LineComment, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Block comment /* */
    if (ch === '/' && peek(1) === '*') {
      advance(); advance(); // /*
      while (pos < len) {
        if (peek() === '*' && peek(1) === '/') {
          advance(); advance(); // */
          break;
        }
        advance();
      }
      pushToken(TokenType.BlockComment, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Date literal dt"..."
    if (ch === 'd' && peek(1) === 't' && peek(2) === '"') {
      advance(); advance(); advance(); // dt"
      while (pos < len && peek() !== '"') {
        advance();
      }
      if (pos < len) advance(); // closing "
      pushToken(TokenType.DateLiteral, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // String "..."
    if (ch === '"') {
      advance(); // opening "
      while (pos < len) {
        if (peek() === '"') {
          advance();
          // Check for escaped ""
          if (peek() === '"') {
            advance();
            continue;
          }
          break;
        }
        if (peek() === '\n') {
          // Unterminated string at newline — stop here
          break;
        }
        advance();
      }
      pushToken(TokenType.String, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Table reference '...'
    if (ch === "'") {
      advance(); // opening '
      while (pos < len) {
        if (peek() === "'") {
          advance();
          // Check for escaped ''
          if (peek() === "'") {
            advance();
            continue;
          }
          break;
        }
        if (peek() === '\n') break; // unterminated
        advance();
      }
      pushToken(TokenType.TableRef, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Column/Measure reference [...]
    if (ch === '[') {
      advance(); // [
      while (pos < len && peek() !== ']') {
        if (peek() === '\n') break; // unterminated
        advance();
      }
      if (pos < len && peek() === ']') advance(); // ]
      pushToken(TokenType.ColumnRef, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      while (pos < len && /\d/.test(peek())) {
        advance();
      }
      if (peek() === '.' && /\d/.test(peek(1))) {
        advance(); // .
        while (pos < len && /\d/.test(peek())) {
          advance();
        }
      }
      if (peek().toLowerCase() === 'e') {
        advance(); // e/E
        if (peek() === '+' || peek() === '-') advance();
        while (pos < len && /\d/.test(peek())) {
          advance();
        }
      }
      pushToken(TokenType.Number, source.slice(startPos, pos), startLine, startCol);
      continue;
    }

    // Identifiers, keywords, functions
    if (/[a-zA-Z_]/.test(ch)) {
      while (pos < len && /[a-zA-Z0-9_]/.test(peek())) {
        advance();
      }
      const id = source.slice(startPos, pos);
      const upper = id.toUpperCase();
      let type: TokenType;
      if (FUNCTIONS.has(upper)) {
        type = TokenType.Function;
      } else if (KEYWORDS.has(upper)) {
        type = TokenType.Keyword;
      } else {
        type = TokenType.Identifier;
      }
      pushToken(type, id, startLine, startCol);
      continue;
    }

    // Multi-character operators
    if (ch === '<' && peek(1) === '>') {
      advance(); advance();
      pushToken(TokenType.Operator, '<>', startLine, startCol);
      continue;
    }
    if (ch === '<' && peek(1) === '=') {
      advance(); advance();
      pushToken(TokenType.Operator, '<=', startLine, startCol);
      continue;
    }
    if (ch === '>' && peek(1) === '=') {
      advance(); advance();
      pushToken(TokenType.Operator, '>=', startLine, startCol);
      continue;
    }
    if (ch === '&' && peek(1) === '&') {
      advance(); advance();
      pushToken(TokenType.Operator, '&&', startLine, startCol);
      continue;
    }
    if (ch === '|' && peek(1) === '|') {
      advance(); advance();
      pushToken(TokenType.Operator, '||', startLine, startCol);
      continue;
    }

    // Single-character operators
    if ('+-*/^=<>&'.includes(ch)) {
      advance();
      pushToken(TokenType.Operator, ch, startLine, startCol);
      continue;
    }

    // Parentheses
    if (ch === '(') {
      advance();
      pushToken(TokenType.OpenParen, '(', startLine, startCol);
      continue;
    }
    if (ch === ')') {
      advance();
      pushToken(TokenType.CloseParen, ')', startLine, startCol);
      continue;
    }

    // Comma
    if (ch === ',') {
      advance();
      pushToken(TokenType.Comma, ',', startLine, startCol);
      continue;
    }

    // Unknown character
    advance();
    pushToken(TokenType.Unknown, ch, startLine, startCol);
  }

  pushToken(TokenType.EOF, '', line, col);
  return tokens;
}
