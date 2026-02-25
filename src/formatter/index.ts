/* ── DAX Formatter ─────────────────────────────────────── */

/**
 * Formats a DAX expression with consistent indentation.
 *
 * Two-pass approach:
 * 1. Normalize — collapse multi-line statements into single logical lines
 * 2. Expand — tokenize structural elements and re-indent
 */
export function formatDax(source: string): string {
  // Step 1: Normalize — collapse to a single line per logical statement,
  // preserving comment lines and blank line separators.
  const rawLines = source.split('\n');
  const chunks: string[] = [];
  let buf = '';

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (buf) { chunks.push(buf); buf = ''; }
      chunks.push('');
      continue;
    }
    if (trimmed.startsWith('//')) {
      if (buf) { chunks.push(buf); buf = ''; }
      chunks.push(trimmed);
      continue;
    }
    buf = buf ? buf + ' ' + trimmed : trimmed;
  }
  if (buf) chunks.push(buf);

  // Step 2: Expand — split on structural tokens and re-indent
  const output: string[] = [];
  let indent = 0;
  const TAB = '    ';

  for (const chunk of chunks) {
    if (!chunk) { output.push(''); continue; }
    if (chunk.startsWith('//')) { output.push(TAB.repeat(indent) + chunk); continue; }

    const tokens = tokenizeForFormat(chunk);
    formatTokens(tokens, output, indent);
  }

  return output.join('\n');
}

function tokenizeForFormat(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // String literal
    if (ch === '"') {
      current += ch; i++;
      while (i < input.length && input[i] !== '"') { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Table ref 'name'
    if (ch === "'") {
      current += ch; i++;
      while (i < input.length && input[i] !== "'") { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Column ref [name]
    if (ch === '[') {
      current += ch; i++;
      while (i < input.length && input[i] !== ']') { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Open paren
    if (ch === '(') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push('(');
      i++; continue;
    }

    // Close paren
    if (ch === ')') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push(')');
      i++; continue;
    }

    // Comma
    if (ch === ',') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push(',');
      i++; continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function formatTokens(tokens: string[], output: string[], startIndent: number): void {
  const TAB = '    ';
  let indent = startIndent;
  let lineBuffer = '';

  function flushLine(): void {
    if (lineBuffer.trim()) {
      output.push(TAB.repeat(indent) + lineBuffer.trim());
    }
    lineBuffer = '';
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const upper = tok.toUpperCase();

    if (tok === '(') {
      lineBuffer += '(';
      flushLine();
      indent++;
      continue;
    }

    if (tok === ')') {
      flushLine();
      indent = Math.max(startIndent, indent - 1);
      lineBuffer = ')';
      const next = tokens[i + 1];
      if (!next || (next !== ',' && next !== ')')) {
        flushLine();
      }
      continue;
    }

    if (tok === ',') {
      lineBuffer += ',';
      flushLine();
      continue;
    }

    // Keywords that should start a new line: VAR, RETURN
    if (upper === 'VAR' || upper.startsWith('VAR ')) {
      flushLine();
      lineBuffer = tok;
      flushLine();
      indent = Math.max(startIndent, indent);
      continue;
    }

    if (upper === 'RETURN' || upper.startsWith('RETURN ')) {
      flushLine();
      const retIndent = Math.max(startIndent, indent);
      output.push(TAB.repeat(retIndent) + tok);
      indent = retIndent + 1;
      continue;
    }

    // Regular content
    if (lineBuffer) {
      lineBuffer += ' ' + tok;
    } else {
      lineBuffer = tok;
    }
  }

  flushLine();
}
