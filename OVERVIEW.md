# DAX Validator

A browser-based development environment for writing, validating, and formatting DAX expressions. Built for consultants and analysts who work with Power BI, Analysis Services, or other tabular models.

---

## Editor

A full-featured code editor with DAX syntax highlighting, bracket matching, and colored bracket pairs. The editor understands DAX structure — functions, table references (`'Sales'`), column references (`[Amount]`), string literals, comments, and keywords are all visually distinct.

The default view includes a sample measure to get started immediately.

---

## Intelligent Autocomplete

Start typing and the editor suggests relevant DAX functions, keywords, and snippets. The suggestions are **context-aware**:

- **Inside `CALCULATE(`** — filter and information functions like `ALL`, `REMOVEFILTERS`, and `SELECTEDVALUE` appear first
- **Inside `SUMX(` or other iterators** — aggregation and math functions are prioritized
- **After typing `[`** — all available measures and columns from your loaded data model are shown
- **After typing `'TableName'[`** — only columns and measures from that specific table appear, plus columns from related tables via relationships
- **VAR variables** — any variables you've declared with `VAR` are suggested with top priority, so you can easily reference them

**168 DAX functions** are included with full documentation — covering Filter, Aggregation, Math, Text, Date/Time, Time Intelligence, Statistical, Information, Logical, Table manipulation, and Relationship categories.

**Ready-made snippets** for common patterns: VAR/RETURN blocks, CALCULATE with filter, SWITCH(TRUE, ...), Year-over-Year comparison, and Running Totals. Select a snippet and tab through the placeholders.

---

## Function Help

Click on any function name in the editor and the **Functiehulp** panel shows detailed documentation:

- Function signature with all parameters
- Which parameters are required vs. optional
- Return type
- Practical notes and common pitfalls
- Code examples
- Direct link to the official Microsoft documentation

---

## Real-Time Diagnostics

As you type, the diagnostics panel at the bottom checks your DAX for problems and shows them organized by severity (errors, warnings, info):

- **Unmatched parentheses** — open `(` without closing `)` or vice versa
- **Unterminated strings, table references, or column references** — missing closing `"`, `'`, or `]`
- **Missing commas** between function arguments
- **VAR without RETURN** — a common mistake where variables are declared but never used
- **Unused variables** — declared with VAR but never referenced
- **Nested IF depth** — suggests `SWITCH(TRUE(), ...)` when IF nesting gets too deep
- **Division by `/`** — suggests using `DIVIDE()` for safe division
- **CALCULATE without filters** — warns about context transition without additional filters
- **FILTER(ALL(...)) pattern** — flags potentially slow patterns on large tables

Click on any diagnostic to jump directly to the problematic location in your code.

### Quick Fixes

Some diagnostics offer automatic fixes — click the lightbulb icon to:
- Replace `/` division with `DIVIDE(a, b)`
- Add a missing `RETURN` statement
- Get guidance on replacing nested IFs with SWITCH

---

## Data Model Integration

Upload your Power BI data model to unlock **model-aware features**:

### Supported File Formats
- **TMDL files** — Upload individual `.tmdl` files or an entire project folder. Supports root model files, perspective files (like `Operational.tmdl`), individual table definitions, and relationship definitions.
- **JSON** — Upload a JSON model definition with tables, columns, and measures.

### What It Enables
- **Table, column, and measure suggestions** directly from your model as you type
- **Relationship-aware suggestions** — when you type `'Contract'[`, you see not only Contract's own columns but also columns from related tables (e.g., linked via foreign keys)
- **Model validation** — the linter flags references to unknown tables or columns that don't exist in your model
- **Click to insert** — click any table, column, or measure in the Model Browser to insert its reference into the editor

### Model Browser

The Model Browser panel shows your entire data model as a tree:
- Tables with column count and measure count
- Expand any table to see its columns (with data types), measures (with expression preview on hover), and related tables (via relationships)
- Relationship count is shown in the model statistics

---

## DAX Formatter

Click **Opmaak** (or press Shift+Alt+F) to automatically format your DAX code:

- Proper indentation after `(`, `)`, and `,`
- `VAR` and `RETURN` keywords start on new lines at the correct indent level
- Respects string literals, table references, and column references (doesn't break them)
- Comments are preserved
- Nested function calls are indented for readability

---

## Expression Library

Save DAX expressions for later reuse via the **Opgeslagen** tab:

- **Save** — Click "Huidige opslaan" or press **Ctrl+S** to save the current editor content with a name
- **Load** — Click "Laden" to restore a saved expression into the editor
- **Update** — Click the refresh icon to overwrite a saved expression with the current editor content
- **Rename** and **Delete** — Manage your saved expressions
- **Persistent** — Expressions are stored in your browser's local storage and survive page refreshes

Each saved expression shows its name, last modified date, and a preview of the code.

---

## Best Practices Guide

The **Best practices** panel provides a built-in reference guide organized by topic:

- **Performance** — When to use CALCULATE vs FILTER(ALL(...)), caching with VAR, avoiding large iterators
- **Readability** — VAR/RETURN patterns, SWITCH vs nested IF, DIVIDE for safe division, descriptive variable names
- **Error handling** — Dealing with BLANK(), division by zero, single-value assumptions
- **Context awareness** — Row context vs filter context, context transition with CALCULATE, why to avoid EARLIER
- **Common pitfalls** — CALCULATE filter overwrite behavior, SUMMARIZE + ADDCOLUMNS, ALL vs REMOVEFILTERS, VALUES vs DISTINCT

---

## Language

The entire interface is available in **Dutch** (default) and **English**. All labels, diagnostics messages, function help, and best practices are fully translated.

---

## Technical Notes

- Runs entirely in the browser — no server required, no data leaves your machine
- Your uploaded model data and saved expressions stay in your browser's local storage
- Works offline after the initial page load
- Copy formatted DAX to clipboard with the **Kopieer** button
