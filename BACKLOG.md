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

## UI / Layout

- [ ] **Move AI assistant panel to the right side**
  The AI assistant panel currently renders in the left drawer alongside the other panels. Reposition it to a dedicated right-side panel so it can be open simultaneously with other panels (model browser, function help, etc.), giving a more natural chat-on-the-right layout.
  `Effort: Medium`

---

## Completed

- [x] **Detect browser locale + language switcher**
  Auto-detect locale from saved preference, then browser language, with English fallback. Added toolbar button (NL/EN) to toggle language at runtime with full UI re-rendering.
