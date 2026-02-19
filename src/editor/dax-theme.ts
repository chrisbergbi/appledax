import * as monaco from 'monaco-editor';

export function registerDaxTheme(): void {
  monaco.editor.defineTheme('dax-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',            foreground: '569CD6', fontStyle: 'bold' },
      { token: 'function',           foreground: '4EC9B0' },
      { token: 'type.table',         foreground: '6A9955' },
      { token: 'type.table.escape',  foreground: '6A9955' },
      { token: 'variable.column',    foreground: 'CE9178' },
      { token: 'string',             foreground: 'D69D85' },
      { token: 'string.escape',      foreground: 'D7BA7D' },
      { token: 'number',             foreground: 'B5CEA8' },
      { token: 'number.date',        foreground: 'B5CEA8' },
      { token: 'comment',            foreground: '6A9955', fontStyle: 'italic' },
      { token: 'operator',           foreground: 'D4D4D4' },
      { token: 'delimiter.parenthesis', foreground: 'FFD700' },
      { token: 'delimiter.comma',    foreground: 'D4D4D4' },
      { token: 'identifier',         foreground: '9CDCFE' },
    ],
    colors: {
      'editor.background': '#1A1A1F',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#C6C6C6',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorBracketMatch.background': '#0064001A',
      'editorBracketMatch.border': '#888888',
    },
  });

  monaco.editor.defineTheme('dax-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword',            foreground: '0000FF', fontStyle: 'bold' },
      { token: 'function',           foreground: '0D7D6C' },
      { token: 'type.table',         foreground: '2E7D32' },
      { token: 'type.table.escape',  foreground: '2E7D32' },
      { token: 'variable.column',    foreground: 'A31515' },
      { token: 'string',             foreground: 'A31515' },
      { token: 'string.escape',      foreground: 'B8860B' },
      { token: 'number',             foreground: '098658' },
      { token: 'number.date',        foreground: '098658' },
      { token: 'comment',            foreground: '6A9955', fontStyle: 'italic' },
      { token: 'operator',           foreground: '333333' },
      { token: 'delimiter.parenthesis', foreground: 'B8860B' },
      { token: 'delimiter.comma',    foreground: '333333' },
      { token: 'identifier',         foreground: '1A56DB' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#1A1A2E',
      'editorLineNumber.foreground': '#9A9AB0',
      'editorLineNumber.activeForeground': '#404058',
      'editor.selectionBackground': '#ADD6FF',
      'editor.inactiveSelectionBackground': '#E5EBF1',
      'editorBracketMatch.background': '#00640020',
      'editorBracketMatch.border': '#B8B8C6',
    },
  });
}
