import * as monaco from 'monaco-editor';
import { t } from '../i18n/index';

export function registerQuickFixProvider(): void {
  monaco.languages.registerCodeActionProvider('dax', {
    provideCodeActions(model, _range, context) {
      const actions: monaco.languages.CodeAction[] = [];

      for (const marker of context.markers) {
        const code = String(marker.code ?? '');

        if (code === 'divide-suggestion') {
          const action = createDivideQuickFix(model, marker);
          if (action) actions.push(action);
        }

        if (code === 'nested-if') {
          actions.push(createSwitchSuggestion(marker));
        }

        if (code === 'var-without-return') {
          const action = createAddReturnFix(model, marker);
          if (action) actions.push(action);
        }
      }

      return { actions, dispose() {} };
    },
    resolvedCodeActionKinds: ['quickfix'],
  } as monaco.languages.CodeActionProvider);
}

function createDivideQuickFix(
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
): monaco.languages.CodeAction | null {
  const line = model.getLineContent(marker.startLineNumber);

  // Find the / operator and its surrounding operands
  const divCol = marker.startColumn - 1; // 0-based
  if (line[divCol] !== '/') return null;

  // Scan backward for the left operand
  let leftStart = divCol - 1;
  while (leftStart >= 0 && line[leftStart] === ' ') leftStart--;
  const leftTrimEnd = leftStart + 1;
  // Find start of left operand (word, number, bracket, or paren)
  const leftChar = line[leftStart];
  if (leftChar === ')' || leftChar === ']') {
    // Find matching open bracket/paren
    let depth = 1;
    const open = leftChar === ')' ? '(' : '[';
    leftStart--;
    while (leftStart >= 0 && depth > 0) {
      if (line[leftStart] === leftChar) depth++;
      if (line[leftStart] === open) depth--;
      if (depth > 0) leftStart--;
    }
    // Include function name before paren if applicable
    if (open === '(' && leftStart > 0) {
      let fnStart = leftStart - 1;
      while (fnStart >= 0 && /[a-zA-Z_\w]/.test(line[fnStart])) fnStart--;
      leftStart = fnStart + 1;
    }
  } else {
    while (leftStart >= 0 && /[a-zA-Z0-9_.'[\]]/.test(line[leftStart])) leftStart--;
    leftStart++;
  }

  // Scan forward for the right operand
  let rightStart = divCol + 1;
  while (rightStart < line.length && line[rightStart] === ' ') rightStart++;
  let rightEnd = rightStart;
  const rightChar = line[rightStart];
  if (rightChar === '(' || rightChar === '[') {
    let depth = 1;
    const close = rightChar === '(' ? ')' : ']';
    rightEnd++;
    while (rightEnd < line.length && depth > 0) {
      if (line[rightEnd] === rightChar) depth++;
      if (line[rightEnd] === close) depth--;
      rightEnd++;
    }
  } else {
    while (rightEnd < line.length && /[a-zA-Z0-9_.'[\]]/.test(line[rightEnd])) rightEnd++;
  }

  const leftOperand = line.substring(leftStart, leftTrimEnd).trim();
  const rightOperand = line.substring(rightStart, rightEnd).trim();

  if (!leftOperand || !rightOperand) return null;

  const fullRange = new monaco.Range(
    marker.startLineNumber, leftStart + 1,
    marker.startLineNumber, rightEnd + 1,
  );

  return {
    title: t('qf.divide', { left: leftOperand, right: rightOperand }),
    kind: 'quickfix',
    diagnostics: [marker],
    isPreferred: true,
    edit: {
      edits: [{
        resource: model.uri,
        textEdit: {
          range: fullRange,
          text: `DIVIDE(${leftOperand}, ${rightOperand})`,
        },
        versionId: model.getVersionId(),
      }],
    },
  };
}

function createSwitchSuggestion(
  marker: monaco.editor.IMarkerData,
): monaco.languages.CodeAction {
  return {
    title: t('qf.switch'),
    kind: 'quickfix',
    diagnostics: [marker],
    isPreferred: false,
  };
}

function createAddReturnFix(
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
): monaco.languages.CodeAction | null {
  // Find the line of the last VAR in the block and add RETURN after it
  const lineCount = model.getLineCount();
  let insertLine = marker.startLineNumber;

  // Find the end of the VAR assignment (next non-empty line that starts a new statement)
  for (let i = marker.startLineNumber; i <= lineCount; i++) {
    const content = model.getLineContent(i).trim();
    if (i > marker.startLineNumber && content.length > 0 && !content.startsWith('//') && !content.startsWith('/*')) {
      insertLine = i;
      break;
    }
  }

  const insertRange = new monaco.Range(insertLine, 1, insertLine, 1);

  return {
    title: t('qf.add_return'),
    kind: 'quickfix',
    diagnostics: [marker],
    isPreferred: true,
    edit: {
      edits: [{
        resource: model.uri,
        textEdit: {
          range: insertRange,
          text: 'RETURN\n    ',
        },
        versionId: model.getVersionId(),
      }],
    },
  };
}
