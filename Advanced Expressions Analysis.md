# Advanced Expressions Analysis

**Dataset**: Advanced Expressions.xlsx
**Date**: 2025-02-23

---

## Dataset Overview

| Metric | Value |
|--------|-------|
| Total expressions | 26,610 |
| Unique customers (tenants) | 399 |
| Calculated columns | 15,141 |
| Measures | 11,407 |
| Expressions with errors | 278 (1.0%) |
| Processed successfully | 26,132 |

### Top Entities (tables used)

| Entity | Expressions |
|--------|-------------|
| Contract | 5,617 |
| PayrollResults | 5,473 |
| Contract History | 3,084 |
| Person | 1,833 |
| Contract Custom Fields | 1,750 |
| Sickness case | 1,566 |
| Reference date filters | 1,296 |
| Payroll mutations | 663 |
| Organizational Unit | 480 |
| Position Management | 455 |
| Leave | 408 |
| PKB Results | 400 |
| Sickness case detail | 386 |
| Person Custom Fields | 353 |
| Journal Entry Employee | 342 |

---

## 1. Quality Scoring

| Grade | Count | % | Description |
|-------|-------|---|-------------|
| **A (90–100)** | 0 | 0.0% | No expressions scored excellent |
| **B (70–89)** | 16,386 | 63.3% | Decent but room for improvement |
| **C (50–69)** | 9,087 | 35.1% | Noticeable bad practices |
| **D (30–49)** | 402 | 1.6% | Significant issues |
| **F (<30)** | 8 | 0.0% | Critically bad |

**Key finding**: No expressions achieved "excellent" status. The overall quality is mediocre — most expressions work but don't follow modern DAX best practices.

### Most Common Issues

| Issue | Count | % |
|-------|-------|---|
| Complex expression without VAR/RETURN | 6,004 | 23.2% |
| Uses `/` instead of `DIVIDE()` | 1,583 | 6.1% |
| Uses `LOOKUPVALUE` instead of `RELATED` | 1,296 | 5.0% |
| `CALCULATE`/aggregation in calculated columns | 761 | 2.9% |
| Long hardcoded numeric lists in `IN{}` | 749 | 2.9% |
| Date arithmetic with `+` instead of `DATEADD` | 650 | 2.5% |
| Nested IF (3+ levels) | 1,100+ | 4.3% |
| `FILTER(ALL(...))` anti-pattern | 261 | 1.0% |
| `+0` or `*1` type coercion | 306 | 1.2% |

### Good Practice Adoption Rates

| Practice | Usage | Verdict |
|----------|-------|---------|
| VAR/RETURN | 23.8% | Low — should be much higher |
| DIVIDE() | 0.6% | **Very low** — `/` used instead |
| SWITCH(TRUE()) | 3.0% | Low — nested IFs dominate |
| REMOVEFILTERS | 0.6% | Low — `ALL()` preferred |
| KEEPFILTERS | 0.4% | Very low |
| SELECTEDVALUE | 4.3% | Moderate |
| COALESCE | 0.8% | Low |

### Most Used DAX Functions

| Function | Count | | Function | Count |
|----------|-------|-|----------|-------|
| IF | 10,202 | | SWITCH | 1,477 |
| CALCULATE | 6,745 | | DATE | 1,451 |
| SUM | 4,711 | | LOOKUPVALUE | 1,305 |
| BLANK | 4,672 | | FORMAT | 1,191 |
| MAX | 4,523 | | SELECTEDVALUE | 1,082 |
| MAXX | 2,913 | | SUMX | 703 |
| RELATED | 2,620 | | DATEDIFF | 657 |
| MIN | 2,515 | | MINX | 613 |
| FILTER | 2,160 | | DISTINCTCOUNT | 604 |
| TODAY | 1,909 | | ROUND | 539 |
| YEAR | 1,838 | | DIVIDE | 151 |
| ISBLANK | 1,805 | | REMOVEFILTERS | 181 |
| EDATE | 1,555 | | KEEPFILTERS | 101 |

---

## 2. Most Used Expressions

### Top 20 Most Duplicated (exact same expression across customers)

| # | Expression / Intent | Count | Type |
|---|---------------------|-------|------|
| 1 | Empty string placeholder `""` | 628 | Column |
| 2 | `BLANK()` | 130 | Column |
| 3 | Space placeholder `" "` | 90 | Column |
| 4 | `RELATED(Person[FullName2])` — full name lookup | 84 | Column |
| 5 | `"0"` constant | 67 | Column |
| 6 | Loon LH — Payroll SUM with `IN{1770,1771}` | 62 | Measure |
| 7 | Sickness 2nd year date calculation | 55 | Column |
| 8 | Sickness 3rd year date calculation | 55 | Column |
| 9 | Leave in period (complex VAR pattern) | 53 | Measure |
| 10 | `RELATED('Organizational unit'[OrganizationalUnit])` | 51 | Column |
| 11 | Contract assignment comparison check | 51 | Measure |
| 12 | OE-kort — short org unit name (VAR + CALCULATE) | 51 | Column |
| 13 | Therapy in period measure | 51 | Measure |
| 14 | `EDATE(SicknessBegin, 12)` — 12 month sickness mark | 54 | Column |
| 15 | Retirement date filter | 48 | Measure |
| 16 | `RELATED(Function[FunctionName])` — function name lookup | 39 | Column |
| 17 | Jubilee 12.5 year — `EDATE(Date_in_service_CAO, 150)` | 41 | Column |
| 18 | Jubilee 25 year — `EDATE(Date_in_service_CAO, 300)` | 40 | Column |
| 19 | Jubilee 40 year — `EDATE(Date_in_service_CAO, 480)` | 40 | Column |
| 20 | Loon ZVW — payroll codes `IN{1785,1788,1786}` | 40 | Measure |

### Expression Intents by Frequency

| Intent Category | Expressions | Customers |
|-----------------|-------------|-----------|
| Payroll result by code | 4,688 | 218 |
| Period/Date filter | 2,512 | 300 |
| Sickness/Absence tracking | 2,160 | 238 |
| Custom field lookup | 1,860 | 254 |
| Jubilee/Anniversary date | 1,240 | 218 |
| Headcount/Count | 1,035 | 215 |
| Salary/Wage calculation | 987 | 228 |
| Name/Personal info lookup | 679 | 211 |
| Value mapping (SWITCH) | 632 | 205 |
| Leave/Absence calculation | 599 | 152 |
| Age calculation | 562 | 181 |
| FTE calculation | 554 | 147 |
| Function/Job title lookup | 538 | 146 |
| Organizational unit lookup | 532 | 143 |
| Service date/tenure | 469 | 196 |
| Working hours | 345 | 129 |
| Turnover/Attrition | 320 | 122 |
| Journal/Cost entry | 153 | 68 |
| Therapy/Reintegration | 76 | 39 |
| Pension | 14 | 11 |

---

## 3. Template Candidates for APPLEDAX

These are the **best quality expressions** per intent category — popular, well-structured, and representative of what users actually need. All use proper DAX patterns (VAR/RETURN, DIVIDE, REMOVEFILTERS, KEEPFILTERS, SWITCH(TRUE())).

### Template 1: Payroll Result by Code
**Usage**: 4,688 expressions across 218 customers
**Type**: Measure

```dax
VAR Totaal =
    CALCULATE(
        SUM('PayrollResults'[PayrollResult]),
        KEEPFILTERS('PayrollResults'[PayrollCode_BK] IN {1970})
    )
RETURN
IF(COALESCE(Totaal, 0) = 0, BLANK(), Totaal)
```

**Why good**: Uses VAR/RETURN, KEEPFILTERS to avoid overwriting filters, COALESCE for null handling.

---

### Template 2: Sickness Case Count in Period
**Usage**: 2,160 expressions across 238 customers
**Type**: Measure

```dax
VAR startdatum = MIN('Reference date filters'[Date])
VAR einddatum = MAX('Reference date filters'[Date])
RETURN
CALCULATE(
    DISTINCTCOUNT('Sickness case'[SicknessCase_BK]),
    REMOVEFILTERS(
        'Sickness case'[Date begin],
        'Sickness case'[Date end],
        'Sickness case'[SicknessCaseDays]
    ),
    'Sickness case'[Date begin] >= startdatum
        && 'Sickness case'[Date end] <= einddatum
)
```

**Why good**: Uses VAR/RETURN, REMOVEFILTERS (not ALL), DISTINCTCOUNT for unique cases, clean date range filtering.

---

### Template 3: Period/Date Filter
**Usage**: 2,512 expressions across 300 customers
**Type**: Measure

```dax
VAR telling =
    CALCULATE(
        DISTINCTCOUNT('Time Registration'[ActivityCode]),
        REMOVEFILTERS('Time Registration'[ActivityCode])
    )
RETURN
IF(telling > 1, 1)
```

**Why good**: Clean VAR/RETURN, REMOVEFILTERS instead of ALL, returns flag for conditional use.

---

### Template 4: Headcount (Contracts per Person)
**Usage**: 1,035 expressions across 215 customers
**Type**: Measure

```dax
VAR PersonBk = MAX(Contract[Person_BK])
RETURN
CALCULATE(
    COUNT(Contract[Contract_BK]),
    REMOVEFILTERS(Contract),
    PersonBk = Contract[Person_BK]
)
```

**Why good**: Uses VAR to capture context before REMOVEFILTERS, clean and efficient.

---

### Template 5: Salary / Daily Wage Calculation
**Usage**: 987 expressions across 228 customers
**Type**: Measure

```dax
VAR Factor = 261
RETURN
DIVIDE([@BOSV dagloon Tot periode], Factor)
```

**Why good**: Uses DIVIDE for safe division, VAR for named constant (261 working days).

---

### Template 6: FTE Percentage
**Usage**: 554 expressions across 147 customers
**Type**: Measure

```dax
VAR FTEIn = [@Aantal FTE instroom]
VAR populatie = [@Telling aantal FTE]
RETURN
DIVIDE(FTEIn, populatie, 0) * 100
```

**Why good**: DIVIDE with alternate result, descriptive VARs, clean percentage calculation.

---

### Template 7: Turnover Percentage
**Usage**: 320 expressions across 122 customers
**Type**: Measure

```dax
VAR populatie = [@Telling aantal personen]
VAR uitdienst = [@Aantal uit dienst]
RETURN
DIVIDE(uitdienst, populatie, 0) * 100
```

**Why good**: Same clean pattern as FTE — DIVIDE, descriptive VARs, percentage output.

---

### Template 8: Jubilee/Anniversary Detection
**Usage**: 1,240 expressions across 218 customers
**Type**: Measure

```dax
VAR aantal_mnd_van = DATEDIFF(
    SELECTEDVALUE('Contract Custom Fields'[Datum ambtsjubileum]),
    MIN('Reference date filters'[Date]), MONTH)
VAR aantal_mnd_tm = DATEDIFF(
    SELECTEDVALUE('Contract Custom Fields'[Datum ambtsjubileum]),
    MAX('Reference date filters'[Date]), MONTH)
RETURN
SWITCH(TRUE(),
    aantal_mnd_van <= 600 && aantal_mnd_tm >= 600, "Jubileum 50 jaar",
    aantal_mnd_van <= 480 && aantal_mnd_tm >= 480, "Jubileum 40 jaar",
    aantal_mnd_van <= 300 && aantal_mnd_tm >= 300, "Jubileum 25 jaar",
    "-"
)
```

**Why good**: SELECTEDVALUE for safe single-value, SWITCH(TRUE()) instead of nested IF, VAR/RETURN, DATEDIFF for date math.

---

### Template 9: Value Mapping with SWITCH
**Usage**: 632 expressions across 205 customers
**Type**: Measure

```dax
VAR inpassing = MAX('Contract'[Payroll_Amount_Number])
RETURN
SWITCH(TRUE(),
    inpassing = 9301, "2de jaars",
    inpassing = 9302, "3de jaars",
    inpassing = 9303, "4de jaars of hoger",
    BLANK()
)
```

**Why good**: SWITCH(TRUE()) for multi-condition mapping, VAR to capture the value once.

---

### Template 10: Function/Scale Comparison
**Usage**: 538 expressions across 146 customers
**Type**: Column

```dax
VAR OGBFS = Contract[SalaryScale_BK]
    - RELATED('Function'[CodePaymentType])
RETURN
SWITCH(TRUE(),
    OGBFS = 0, "Op functieschaal",
    OGBFS < 0, "Onder functieschaal",
    OGBFS > 0, "Boven functieschaal",
    BLANK()
)
```

**Why good**: RELATED for relationship traversal (not LOOKUPVALUE), SWITCH(TRUE()) for classification, VAR for intermediate calculation.

---

### Template 11: Custom Field Sum per Person
**Usage**: 1,860 expressions across 254 customers
**Type**: Measure

```dax
VAR Werknemer = MAX(Contract[Person_BK])
RETURN
CALCULATE(
    SUM('Contract Custom Fields'[Gekoppeld DV (P02950)]),
    REMOVEFILTERS(Contract),
    NOT ISBLANK('Contract Custom Fields'[Gekoppeld DV (P02950)]),
    NOT 'Contract Custom Fields'[Gekoppeld DV (P02950)] = 0,
    Contract[Person_BK] = Werknemer
)
```

**Why good**: VAR to capture person context before REMOVEFILTERS, explicit null/zero exclusion.

---

### Template 12: Previous Period Comparison
**Usage**: 345 expressions across 129 customers
**Type**: Measure

```dax
VAR _PreviousDate = MAX('Payroll control register'[PreviousPeriodYearNumber])
RETURN
ROUND(
    CALCULATE(
        [@HP_Overuren],
        REMOVEFILTERS(
            'Payroll control register'[PeriodYear],
            'Payroll control register'[PeriodNumber],
            'Payroll control register'[StartDate],
            'Payroll control register'[EndDate]
        ),
        'Payroll control register'[PeriodYearNumber] = _PreviousDate
    ), 2
)
```

**Why good**: Granular REMOVEFILTERS (not ALL on entire table), VAR for period reference, ROUND for clean output.

---

### Template 13: Journal Cost Center Padding
**Usage**: 153 expressions across 68 customers
**Type**: Column

```dax
VAR Result = RIGHT("0000000" & 'Journal Entry Employee'[Cost Unit Code], 3)
RETURN
IF(Result = "000", "001", Result)
```

**Why good**: Clean string padding pattern, VAR for intermediate result, simple and readable.

---

### Template 14: Name with Vacancy Display
**Usage**: 679 expressions across 211 customers
**Type**: Column

```dax
VAR ActiefDienst = COALESCE([FTE Mdw in actieve dienst], 0)
VAR NaamVolledig = [mdw naam volledig]
VAR NaamVac = [mdw achternaam]
RETURN
IF(ActiefDienst = 0, "VAC " & NaamVac, NaamVolledig)
```

**Why good**: COALESCE for null handling, descriptive VARs, clean conditional logic.

---

### Template 15: Leave Deduction with SWITCH Logic
**Usage**: 599 expressions across 152 customers
**Type**: Measure

```dax
VAR Korten = [@Nog te korten]
VAR MutatieADV = [@Mutatie Korting ADV]
VAR SaldoWV = [@Saldo Wettelijk]
VAR ReedsGekort = [@Reeds gekort Wettelijk]
RETURN
SWITCH(TRUE(),
    Korten = 0 || (Korten - MutatieADV) = 0, BLANK(),
    SaldoWV <= 0 && Korten > 0, BLANK(),
    Korten > 0 && SaldoWV < (Korten - MutatieADV), SaldoWV,
    Korten > 0 && SaldoWV >= (Korten - MutatieADV), Korten - MutatieADV,
    Korten < 0 && (Korten - MutatieADV + ReedsGekort) < 0, ReedsGekort * -1,
    Korten < 0, Korten - MutatieADV
)
```

**Why good**: Complex business logic made readable with VARs + SWITCH(TRUE()) — avoids deeply nested IFs.

---

### Template 16: Pension Cap Check
**Usage**: 14 expressions across 11 customers
**Type**: Measure

```dax
VAR Aftoppingsgrens = 101519
VAR pr1639 = [@UVC1639 Grondslag PFZW]
VAR persoon = MAX(PayrollResults[RegistrationNumber])
VAR Verschil = pr1639 - Aftoppingsgrens
RETURN
IF(ISBLANK(persoon), BLANK(), pr1639 - Aftoppingsgrens)
```

**Why good**: Named constant for cap threshold, VAR/RETURN, explicit BLANK check.

---

### Template 17: Organizational Unit Classification
**Usage**: 532 expressions across 143 customers
**Type**: Column

```dax
VAR eerstepositie = LEFT('Organizational unit'[OrganizationalUnitTypeCode], 1)
RETURN
SWITCH(TRUE(),
    eerstepositie = BLANK(), "",
    eerstepositie = "V", "Care",
    eerstepositie = "M", "MSB",
    "Cure"
)
```

**Why good**: SWITCH(TRUE()) for classification, VAR to extract value once, handles BLANK case.

---

### Template 18: Service Tenure / Starter Rate
**Usage**: 469 expressions across 196 customers
**Type**: Measure

```dax
VAR MinDate = MIN('Time'[FirstOfMonth])
VAR MaxDate = EOMONTH(MAX('Time'[FirstOfMonth]), 0)
VAR StarterCount =
    CALCULATE(
        COUNT('Contract'[Contract_BK]),
        'Contract'[Date_in_service] >= MinDate,
        'Contract'[Date_in_service] < MaxDate
    )
RETURN
DIVIDE(StarterCount, [Employees])
```

**Why good**: EOMONTH for proper end-of-month, multiple VARs for clarity, DIVIDE for safe division.

---

## 4. Summary & Recommendations

### Biggest Opportunities for Improvement

1. **VAR/RETURN adoption is only 23.8%** — 76% of expressions use inline calculations making them hard to read and debug
2. **DIVIDE() is almost unused (0.6%)** while `/` appears in 6.1% of expressions — significant division-by-zero risk
3. **LOOKUPVALUE is overused (5.1%)** where RELATED would be more efficient via proper relationships
4. **Nested IF is endemic** — 4.3% of expressions have 3+ levels, some reaching 40–140 levels deep
5. **FILTER(ALL(...))** anti-pattern appears in 1.0% — should use CALCULATE with boolean filters
6. **Calculated columns contain aggregations** in 2.9% of cases — these should almost always be measures

### What the Templates Demonstrate

All 18 templates consistently show the right patterns:
- **VAR/RETURN** for named intermediate steps
- **DIVIDE()** instead of `/` for safe division
- **SWITCH(TRUE())** instead of nested IF chains
- **REMOVEFILTERS** instead of ALL() for clarity
- **KEEPFILTERS** to avoid overwriting existing filters
- **SELECTEDVALUE** for safe single-value extraction
- **COALESCE** for null handling
- **RELATED** instead of LOOKUPVALUE for relationship navigation
