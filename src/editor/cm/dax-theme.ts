import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/* ── Dark theme ─────────────────────────────────────────── */

const darkEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1A1A1F',
    color: '#D4D4D4',
  },
  '.cm-content': {
    caretColor: '#569CD6',
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    fontSize: '14px',
    padding: '8px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#569CD6',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#264F78',
  },
  '.cm-panels': { backgroundColor: '#1A1A1F', color: '#D4D4D4' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #3c3c48' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #3c3c48' },
  '.cm-searchMatch': { backgroundColor: '#515c6a' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#5a3a3a' },
  '.cm-activeLine': { backgroundColor: '#1E1E24' },
  '.cm-selectionMatch': { backgroundColor: '#515c6a80' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: '#0064001A',
    outline: '1px solid #888888',
  },
  '.cm-gutters': {
    backgroundColor: '#1A1A1F',
    color: '#858585',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    color: '#C6C6C6',
    backgroundColor: 'transparent',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#3c3c48',
    color: '#D4D4D4',
    border: 'none',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
    color: '#858585',
    fontSize: '12px',
    lineHeight: '1.6',
    padding: '0 2px',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#D4D4D4',
  },
  '.cm-tooltip': {
    backgroundColor: '#252526',
    border: '1px solid #454545',
    color: '#D4D4D4',
  },
  '.cm-tooltip .cm-tooltip-arrow:before': {
    borderTopColor: '#454545',
    borderBottomColor: '#454545',
  },
  '.cm-tooltip .cm-tooltip-arrow:after': {
    borderTopColor: '#252526',
    borderBottomColor: '#252526',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li': { padding: '3px 8px' },
    '& > ul > li[aria-selected]': {
      backgroundColor: '#04395e',
      color: '#ffffff',
    },
  },
  '.cm-completionIcon': {
    paddingRight: '4px',
    opacity: '0.8',
  },
  '.cm-completionLabel': {
    fontSize: '13px',
  },
  '.cm-completionDetail': {
    fontStyle: 'italic',
    opacity: '0.7',
    marginLeft: '8px',
  },
  // Diagnostics (lint)
  '.cm-tooltip-lint': {
    maxWidth: '500px',
  },
  '.cm-diagnostic': {
    padding: '6px 10px',
    marginLeft: '-1px',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid #f44747',
  },
  '.cm-diagnostic-warning': {
    borderLeft: '3px solid #cca700',
  },
  '.cm-diagnostic-info': {
    borderLeft: '3px solid #3794ff',
  },
  '.cm-diagnosticAction': {
    background: 'linear-gradient(135deg, #2d8cf0, #6366f1)',
    color: '#fff',
    border: 'none',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    marginLeft: '0',
    marginTop: '6px',
    display: 'inline-block',
  },
  '.cm-diagnosticSource': {
    opacity: '0.5',
    fontSize: '11px',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy #f44747' },
  '.cm-lintRange-warning': { textDecoration: 'underline wavy #cca700' },
  '.cm-lintRange-info': { textDecoration: 'underline wavy #3794ff' },
}, { dark: true });

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569CD6', fontWeight: 'bold' },
  { tag: tags.function(tags.definition(tags.variableName)), color: '#4EC9B0' },
  { tag: tags.typeName, color: '#6A9955' },               // table refs
  { tag: tags.variableName, color: '#CE9178' },            // column refs
  { tag: tags.name, color: '#9CDCFE' },           // identifiers
  { tag: tags.string, color: '#D69D85' },
  { tag: tags.number, color: '#B5CEA8' },
  { tag: [tags.lineComment, tags.blockComment], color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.operator, color: '#D4D4D4' },
  { tag: tags.paren, color: '#FFD700' },
  { tag: tags.separator, color: '#D4D4D4' },
]);

/* ── Light theme ────────────────────────────────────────── */

const lightEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#FFFFFF',
    color: '#1A1A2E',
  },
  '.cm-content': {
    caretColor: '#0000FF',
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    fontSize: '14px',
    padding: '8px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#0000FF',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#ADD6FF',
  },
  '.cm-panels': { backgroundColor: '#FFFFFF', color: '#1A1A2E' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #e0e0e6' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #e0e0e6' },
  '.cm-searchMatch': { backgroundColor: '#e8e8e8' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f5d0d0' },
  '.cm-activeLine': { backgroundColor: '#f0f0f5' },
  '.cm-selectionMatch': { backgroundColor: '#e8e8e880' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: '#00640020',
    outline: '1px solid #B8B8C6',
  },
  '.cm-gutters': {
    backgroundColor: '#FFFFFF',
    color: '#9A9AB0',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    color: '#404058',
    backgroundColor: 'transparent',
  },
  '.cm-tooltip': {
    backgroundColor: '#f8f8f8',
    border: '1px solid #d0d0d6',
    color: '#1A1A2E',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li': { padding: '3px 8px' },
    '& > ul > li[aria-selected]': {
      backgroundColor: '#d6ebff',
      color: '#000000',
    },
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#e8e8f0',
    color: '#404058',
    border: 'none',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
    color: '#9A9AB0',
    fontSize: '12px',
    lineHeight: '1.6',
    padding: '0 2px',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#404058',
  },
  '.cm-completionIcon': { paddingRight: '4px', opacity: '0.7' },
  '.cm-completionLabel': { fontSize: '13px' },
  '.cm-completionDetail': { fontStyle: 'italic', opacity: '0.6', marginLeft: '8px' },
  '.cm-tooltip-lint': {
    maxWidth: '500px',
  },
  '.cm-diagnostic': {
    padding: '6px 10px',
    marginLeft: '-1px',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  '.cm-diagnostic-error': { borderLeft: '3px solid #e51400' },
  '.cm-diagnostic-warning': { borderLeft: '3px solid #bf8803' },
  '.cm-diagnostic-info': { borderLeft: '3px solid #1a85ff' },
  '.cm-diagnosticAction': {
    background: 'linear-gradient(135deg, #1a73e8, #5b5fc7)',
    color: '#fff',
    border: 'none',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    marginLeft: '0',
    marginTop: '6px',
    display: 'inline-block',
  },
  '.cm-diagnosticSource': {
    opacity: '0.5',
    fontSize: '11px',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy #e51400' },
  '.cm-lintRange-warning': { textDecoration: 'underline wavy #bf8803' },
  '.cm-lintRange-info': { textDecoration: 'underline wavy #1a85ff' },
}, { dark: false });

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000FF', fontWeight: 'bold' },
  { tag: tags.function(tags.definition(tags.variableName)), color: '#0D7D6C' },
  { tag: tags.typeName, color: '#2E7D32' },
  { tag: tags.variableName, color: '#A31515' },
  { tag: tags.name, color: '#1A56DB' },
  { tag: tags.string, color: '#A31515' },
  { tag: tags.number, color: '#098658' },
  { tag: [tags.lineComment, tags.blockComment], color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.operator, color: '#333333' },
  { tag: tags.paren, color: '#B8860B' },
  { tag: tags.separator, color: '#333333' },
]);

/* ── Exports ────────────────────────────────────────────── */

export const darkTheme = [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)];
export const lightTheme = [lightEditorTheme, syntaxHighlighting(lightHighlightStyle)];
