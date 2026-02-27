import fs from 'node:fs';

const matrixPath = 'TEST_MATRIX_LINT.md';
if (!fs.existsSync(matrixPath)) {
  console.error(`Missing ${matrixPath}`);
  process.exit(1);
}

const matrix = fs.readFileSync(matrixPath, 'utf8');
const requiredRules = [
  'related-row-context',
  'relatedtable-row-context',
  'calculate-multi-table-filter',
  'calculate-nested-calculate-filter',
  'selectedvalue-missing-default',
  'divide-missing-alternate',
];

for (const ruleId of requiredRules) {
  if (!matrix.includes(ruleId)) {
    console.error(`Matrix missing coverage note for rule: ${ruleId}`);
    process.exit(1);
  }
}

console.log(`Regression matrix check passed (${requiredRules.length} rule entries found).`);
