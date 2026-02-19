export interface DaxFunctionParam {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface DaxFunction {
  name: string;
  category: string;
  signatures: string[];
  description_short: string;
  params: DaxFunctionParam[];
  returns: string;
  notes: string[];
  pitfalls: string[];
  examples: string[];
  learn_url: string;
}

export interface LintDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  ruleId: string;
  quickFix?: QuickFix;
}

export interface QuickFix {
  title: string;
  edits: Array<{
    range: { startLine: number; startCol: number; endLine: number; endCol: number };
    text: string;
  }>;
}

export enum TokenType {
  Keyword = 'Keyword',
  Function = 'Function',
  Identifier = 'Identifier',
  TableRef = 'TableRef',
  ColumnRef = 'ColumnRef',
  String = 'String',
  Number = 'Number',
  LineComment = 'LineComment',
  BlockComment = 'BlockComment',
  Operator = 'Operator',
  OpenParen = 'OpenParen',
  CloseParen = 'CloseParen',
  Comma = 'Comma',
  Whitespace = 'Whitespace',
  DateLiteral = 'DateLiteral',
  Unknown = 'Unknown',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export type LintRule = (tokens: Token[], source: string) => LintDiagnostic[];
