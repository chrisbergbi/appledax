import * as monaco from 'monaco-editor';
import { registerDaxLanguage } from './dax-language';
import { registerDaxTheme } from './dax-theme';
import { registerCompletionProvider } from './completions';
import { registerHoverProvider } from './hover';
import { registerQuickFixProvider } from './quick-fixes';

// Configure Monaco worker
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    );
  },
};

export function createEditor(container: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  registerDaxLanguage();
  registerDaxTheme();

  const editor = monaco.editor.create(container, {
    value: getDefaultDaxCode(),
    language: 'dax',
    theme: 'dax-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    lineNumbers: 'on',
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    matchBrackets: 'always',
    bracketPairColorization: { enabled: true },
    suggest: {
      showKeywords: true,
      showFunctions: true,
      showSnippets: true,
      localityBonus: true,
      preview: true,
      filterGraceful: true,
      snippetsPreventQuickSuggestions: false,
    },
    suggestOnTriggerCharacters: true,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true,
    },
    wordBasedSuggestions: 'off',
    padding: { top: 8 },
    tabSize: 4,
    insertSpaces: true,
  });

  registerCompletionProvider();
  registerHoverProvider();
  registerQuickFixProvider();

  return editor;
}

function getDefaultDaxCode(): string {
  return `// DAX Measure Example - Total Sales with Discount
Total Sales After Discount =
VAR SalesAmount = SUM(Sales[Amount])
VAR TotalDiscount = SUM(Sales[Discount])
VAR NetSales = SalesAmount - TotalDiscount
RETURN
    IF(
        NetSales > 0,
        NetSales,
        BLANK()
    )

// Year-over-Year Growth %
YoY Growth % =
VAR CurrentSales = [Total Sales After Discount]
VAR PriorYearSales =
    CALCULATE(
        [Total Sales After Discount],
        SAMEPERIODLASTYEAR('Date'[Date])
    )
RETURN
    DIVIDE(
        CurrentSales - PriorYearSales,
        PriorYearSales
    )
`;
}
