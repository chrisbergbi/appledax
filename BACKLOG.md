# APPLEDAX Backlog

Improvement proposals and feature ideas for future development.
Items are roughly ordered by priority within each category.

---

## Code Quality & Architecture

- [ ] **Add test suite (Vitest)**
  Extract formatter from main.ts, then add tests for: lexer (edge cases like escaped quotes, date literals, unterminated strings), all 12 lint rules (positive/negative cases), formatter (round-trip tests), and TMDL/JSON parsers. Vitest requires near-zero config since the project already uses Vite.
  `Effort: Medium`

- [ ] **Extract formatter from main.ts**
  `formatDax`, `tokenizeForFormat`, and `formatTokens` (~170 lines) are a standalone concern mixed into the bootstrap file. The formatter also has its own tokenizer that duplicates the real lexer. Move to `src/formatter/index.ts` and reuse the existing lexer tokens.
  `Effort: Low`

- [ ] **Add error boundary around formatDax**
  If `formatDax` throws on malformed input, the button handler silently fails. Wrap in try/catch with user feedback (e.g. a toast or status bar message).
  `Effort: Trivial`

- [ ] **Move dev dependencies to devDependencies**
  `typescript` and `vite` are in `dependencies` but are only needed at build time. Move them to `devDependencies` for correctness.
  `Effort: Trivial`

---

## Security & Robustness

- [ ] **Add single-quote escaping to HTML `esc()` functions**
  The `esc()` helpers in `expression-library.ts` and `model-browser.ts` escape `&<>"` but not `'`. Adding `'` -> `&#39;` prevents edge cases in attribute contexts. Consider migrating innerHTML rendering to `createElement` + `textContent` for user-provided strings.
  `Effort: Trivial`

---

## Performance

- [ ] **Lexer: use string slicing instead of character concatenation**
  Tokens are built char-by-char via `str += advance()`, creating many intermediate strings. Track start/end positions and use `source.slice(startPos, endPos)` instead.
  `Effort: Medium`

- [ ] **Autocomplete: use `doc.sliceString(0, pos)` instead of `doc.toString()`**
  `extractVarNames` in `dax-completions.ts` materializes the entire document to a string on every keystroke. Use `doc.sliceString(0, pos)` to only materialize text before the cursor.
  `Effort: Trivial`

- [ ] **Cache IndexedDB connection**
  `openDB()` in `expression-library.ts` opens a fresh IndexedDB connection on every read/write. Cache the `IDBDatabase` instance to avoid connection churn.
  `Effort: Low`

- [ ] **Single-pass linter architecture**
  Currently all 12 rules independently scan the full token array. For a future optimization, consider a visitor pattern where tokens are traversed once and rules register interest in specific token types. Not urgent unless the rule set grows significantly.
  `Effort: High`

---

## Developer Experience

- [ ] **Add listener cleanup / unsubscribe functions**
  `model/store.ts`, `dax-lint.ts`, and `setup.ts` all have listener arrays that grow but never shrink (no way to unsubscribe). Add return-value cleanup functions. Not critical for a single-page app, but prevents issues if component lifecycle management is added later.
  `Effort: Low`

- [ ] **Document TMDL mixed-indentation limitation**
  `getIndentLevel` in `tmdl-parser.ts` silently mishandles mixed tabs+spaces. Either tighten the logic or document as a known limitation.
  `Effort: Trivial`

---

## Internationalization

- [ ] **Support Spanish locale**
  Add `src/i18n/es.ts` with Spanish translations for all UI strings, diagnostics, function help, and best practices. Register `'es'` in the `SUPPORTED_LOCALES` array in `src/i18n/index.ts`, update the `Locale` type, and extend the language toggle button to cycle through NL/EN/ES.
  `Effort: Medium`

---

## AI Assistant

- [ ] **Show only free models in AI model selector**
  Currently `FAVORITE_MODELS` in `src/ai/provider.ts` includes paid models (gpt-4o, claude-sonnet-4-6, claude-opus-4-6, deepseek-r1) alongside free ones (gpt-4o-mini, gemini-2.5-flash-lite). The full dynamic model list from Puter.js also mixes free and paid. Filter the model selector to only show models available without payment, or add a toggle/filter to hide paid models.
  `Effort: Low`

- [ ] **Improve AI assistant UI**
  The AI chat panel (`src/panels/ai-assistant.ts`) works but has room for polish: (1) add a copy-to-clipboard button on code blocks alongside the existing Insert button, (2) expand markdown rendering to support tables, blockquotes, links, and nested lists, (3) add message edit/regenerate so users can refine prompts without retyping, and (4) show a token or cost indicator when using paid BYOK providers (OpenAI, Gemini).
  `Effort: Medium`

- [ ] **Add "Data Model Info" persona/prompt**
  Add a new persona in `src/ai/personas.ts` (alongside existing `dax-expert` and `hr-mentor`) focused on answering questions about the loaded data model — tables, columns, data types, relationships, and cardinality. The prompt should instruct the AI to use the injected model context to explain structure, suggest joins, and clarify column meanings. Register it in the persona selector with an i18n display name.
  `Effort: Low`

---

## Model Browser

- [ ] **Improve model browser UI and usability**
  The model browser tree view (`src/panels/model-browser.ts`) becomes hard to navigate with large models. Add: (1) a search/filter box at the top to find tables, columns, or measures by name, (2) alphabetical sort option alongside model-order, (3) better handling of long names (tooltip on truncation), and (4) show relationship cardinality (1:N, N:N) and join columns more explicitly. Consider collapsible category groups within tables (columns vs measures vs relationships).
  `Effort: Medium`

- [ ] **Improve model browser: translations, comments, and overview**
  The model browser (`src/panels/model-browser.ts`) currently shows tables, columns (with data types), measures (expression on hover), and relationships (with path). Improve by: (1) displaying translation properties when present in the model, (2) showing description/comment fields for tables, columns, and measures, and (3) improving the general overview layout — e.g. relationship cardinality, column visibility/hidden status, and clearer grouping.
  `Effort: Medium`

---

## Editor

- [ ] **Improve DAX autocomplete/autosuggest**
  The completion source (`src/editor/cm/dax-completions.ts`) offers functions, keywords, columns, measures, and VAR variables with context-aware boosting, but can be improved: (1) track recently used completions and boost them in the suggestion list, (2) show return-type hints (e.g. "returns TABLE", "returns SCALAR") on function completions, (3) add fuzzy matching so partial/out-of-order typing still finds the right function, and (4) for large models with many columns, group or cap suggestions to avoid an overwhelming list.
  `Effort: Medium`

---

## UI / Layout

- [ ] **Improve mobile and tablet experience**
  Below 900px both sidebars are hidden (`display: none`) with no way to reopen them — users lose access to the model browser, expression library, and AI assistant on mobile. Add: (1) a hamburger or bottom-sheet menu to access panels on small screens, (2) a tablet breakpoint (~768px) that shows one sidebar at a time, (3) touch-friendly sizing for resize handles and buttons, and (4) responsive editor header that collapses or wraps toolbar actions on narrow viewports.
  `Effort: High`

- [ ] **Move AI assistant panel to the right side**
  The AI assistant panel currently renders in the left drawer alongside the other panels. Reposition it to a dedicated right-side panel so it can be open simultaneously with other panels (model browser, function help, etc.), giving a more natural chat-on-the-right layout.
  `Effort: Medium`

---

## Expression Library

- [ ] **Add 18 pre-built DAX templates to the expression library**
  Based on analysis of 26,610 real-world expressions from 399 customers, add 18 curated templates covering the most common use cases: Payroll Result by Code, Sickness Case Count, Period/Date Filter, Headcount, Salary/Daily Wage, FTE Percentage, Turnover Percentage, Jubilee/Anniversary Detection, Value Mapping (SWITCH), Function/Scale Comparison, Custom Field Sum per Person, Previous Period Comparison, Journal Cost Center Padding, Name with Vacancy Display, Leave Deduction, Pension Cap Check, Org Unit Classification, and Service Tenure Rate. All templates follow DAX best practices (VAR/RETURN, DIVIDE, REMOVEFILTERS, KEEPFILTERS, SWITCH(TRUE())). Source: `Advanced Expressions Analysis.md` section 3.
  `Effort: Medium`

---

## Completed

- [x] **Detect browser locale + language switcher**
  Auto-detect locale from saved preference, then browser language, with English fallback. Added toolbar button (NL/EN) to toggle language at runtime with full UI re-rendering.
