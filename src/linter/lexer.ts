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
    const ch = peek();

    // Whitespace
    if (/\s/.test(ch)) {
      let ws = '';
      while (pos < len && /\s/.test(peek())) {
        ws += advance();
      }
      pushToken(TokenType.Whitespace, ws, startLine, startCol);
      continue;
    }

    // Line comment //
    if (ch === '/' && peek(1) === '/') {
      let comment = '';
      while (pos < len && peek() !== '\n') {
        comment += advance();
      }
      pushToken(TokenType.LineComment, comment, startLine, startCol);
      continue;
    }

    // Block comment /* */
    if (ch === '/' && peek(1) === '*') {
      let comment = advance() + advance(); // /*
      let closed = false;
      while (pos < len) {
        if (peek() === '*' && peek(1) === '/') {
          comment += advance() + advance(); // */
          closed = true;
          break;
        }
        comment += advance();
      }
      if (!closed) {
        // Unterminated block comment — still emit the token
        pushToken(TokenType.BlockComment, comment, startLine, startCol);
      } else {
        pushToken(TokenType.BlockComment, comment, startLine, startCol);
      }
      continue;
    }

    // Date literal dt"..."
    if (ch === 'd' && peek(1) === 't' && peek(2) === '"') {
      let lit = advance() + advance() + advance(); // dt"
      while (pos < len && peek() !== '"') {
        lit += advance();
      }
      if (pos < len) lit += advance(); // closing "
      pushToken(TokenType.DateLiteral, lit, startLine, startCol);
      continue;
    }

    // String "..."
    if (ch === '"') {
      let str = advance(); // opening "
      while (pos < len) {
        if (peek() === '"') {
          str += advance();
          // Check for escaped ""
          if (peek() === '"') {
            str += advance();
            continue;
          }
          break;
        }
        if (peek() === '\n') {
          // Unterminated string at newline — stop here
          break;
        }
        str += advance();
      }
      pushToken(TokenType.String, str, startLine, startCol);
      continue;
    }

    // Table reference '...'
    if (ch === "'") {
      let ref = advance(); // opening '
      while (pos < len) {
        if (peek() === "'") {
          ref += advance();
          // Check for escaped ''
          if (peek() === "'") {
            ref += advance();
            continue;
          }
          break;
        }
        if (peek() === '\n') break; // unterminated
        ref += advance();
      }
      pushToken(TokenType.TableRef, ref, startLine, startCol);
      continue;
    }

    // Column/Measure reference [...]
    if (ch === '[') {
      let ref = advance(); // [
      while (pos < len && peek() !== ']') {
        if (peek() === '\n') break; // unterminated
        ref += advance();
      }
      if (pos < len && peek() === ']') ref += advance(); // ]
      pushToken(TokenType.ColumnRef, ref, startLine, startCol);
      continue;
    }

    // Numbers
    if (/\d/.test(ch)) {
      let num = '';
      while (pos < len && /\d/.test(peek())) {
        num += advance();
      }
      if (peek() === '.' && /\d/.test(peek(1))) {
        num += advance(); // .
        while (pos < len && /\d/.test(peek())) {
          num += advance();
        }
      }
      if (peek().toLowerCase() === 'e') {
        num += advance(); // e/E
        if (peek() === '+' || peek() === '-') num += advance();
        while (pos < len && /\d/.test(peek())) {
          num += advance();
        }
      }
      pushToken(TokenType.Number, num, startLine, startCol);
      continue;
    }

    // Identifiers, keywords, functions
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (pos < len && /[a-zA-Z0-9_]/.test(peek())) {
        id += advance();
      }
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
