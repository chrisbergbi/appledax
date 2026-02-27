import { tokenize } from '../linter/lexer.js';
import { allRules } from '../linter/rules/index.js';

interface TestCase {
  name: string;
  source: string;
  mustInclude: string[];
  mustExclude?: string[];
}

const cases: TestCase[] = [
  {
    name: 'related-row-context warns outside iterator',
    source: `Measure = RELATED('Product'[Color])`,
    mustInclude: ['related-row-context'],
  },
  {
    name: 'related-row-context does not warn inside SUMX',
    source: `Measure = SUMX('Sales', RELATED('Product'[Color]))`,
    mustInclude: [],
    mustExclude: ['related-row-context'],
  },
  {
    name: 'calculate multi-table filter is flagged',
    source: `Measure = CALCULATE([Sales], 'Date'[Year] = 2024 && 'Product'[Color] = "Red")`,
    mustInclude: ['calculate-multi-table-filter'],
  },
  {
    name: 'selectedvalue missing default is hinted',
    source: `Measure = SELECTEDVALUE('Date'[Year])`,
    mustInclude: ['selectedvalue-missing-default'],
  },
  {
    name: 'divide missing alternate is hinted',
    source: `Measure = DIVIDE([Num], [Den])`,
    mustInclude: ['divide-missing-alternate'],
  },
];

function runCase(tc: TestCase): void {
  const tokens = tokenize(tc.source);
  const diags = allRules.flatMap((rule) => {
    try {
      return rule(tokens, tc.source);
    } catch (err) {
      throw new Error(`Rule threw for case "${tc.name}": ${String(err)}`);
    }
  });

  const ruleIds = new Set(diags.map((d) => d.ruleId));

  for (const id of tc.mustInclude) {
    if (!ruleIds.has(id)) {
      throw new Error(`Case "${tc.name}" expected rule "${id}" but it was absent.`);
    }
  }
  for (const id of tc.mustExclude ?? []) {
    if (ruleIds.has(id)) {
      throw new Error(`Case "${tc.name}" expected rule "${id}" to be absent but it was present.`);
    }
  }
}

for (const tc of cases) {
  runCase(tc);
}

console.log(`Lint regression checks passed (${cases.length} cases).`);
