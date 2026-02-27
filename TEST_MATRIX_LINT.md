# Lint Test Matrix

Use these snippets in the editor and confirm diagnostics in the bottom panel.

## 1) RELATED without row context

```dax
Test = RELATED('Product'[Color])
```

Expected:
- `related-row-context` warning

## 2) RELATED with row context (valid)

```dax
Test =
SUMX(
    'Sales',
    RELATED('Product'[Color])
)
```

Expected:
- no `related-row-context` diagnostic

## 3) RELATEDTABLE without row context

```dax
Test = COUNTROWS(RELATEDTABLE('Sales'))
```

Expected:
- `relatedtable-row-context` warning

## 4) CALCULATE boolean filter with multiple tables

```dax
Test =
CALCULATE(
    [Sales Amount],
    'Date'[Calendar Year] = 2024 && 'Product'[Color] = "Red"
)
```

Expected:
- `calculate-multi-table-filter` error

## 5) Nested CALCULATE in boolean filter

```dax
Test =
CALCULATE(
    [Sales Amount],
    'Date'[Calendar Year] = CALCULATE(MAX('Date'[Calendar Year]))
)
```

Expected:
- `calculate-nested-calculate-filter` error

## 6) SELECTEDVALUE without alternate result

```dax
Test = SELECTEDVALUE('Date'[Calendar Year])
```

Expected:
- `selectedvalue-missing-default` info

## 7) DIVIDE without alternate result

```dax
Test = DIVIDE([Numerator], [Denominator])
```

Expected:
- `divide-missing-alternate` info

## 8) Unqualified column ambiguity in iterator context

```dax
Test =
SUMX(
    'Sales',
    [DateKey]
)
```

Expected (depends on model):
- if `[DateKey]` exists in multiple context tables, `ambiguous_unqualified_column` info
- if it exists in none, `unknown_column_unqualified` warning
