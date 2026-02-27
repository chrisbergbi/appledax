import { strict as assert } from 'node:assert';
import { extractApiMessage, preflightCode, preflightHint } from '../utils.js';

assert.equal(preflightCode(401, 'unauthorized'), 'AUTH');
assert.equal(preflightCode(403, 'missing build permission'), 'MISSING_BUILD');
assert.equal(preflightCode(403, 'tenant setting execute queries disabled'), 'TENANT_SETTING');
assert.equal(preflightCode(429, 'rate limit'), 'RATE_LIMIT');
assert.equal(preflightCode(500, 'server'), 'EXECUTE');

assert.equal(preflightHint(403, 'missing build'), 'Grant Build permission on the semantic model.');
assert.equal(
  preflightHint(403, 'tenant setting execute queries disabled'),
  'Enable Dataset Execute Queries REST API in the Power BI admin portal.',
);

assert.equal(extractApiMessage({ error: { message: 'bad' } }), 'bad');
assert.equal(extractApiMessage({ message: 'oops' }), 'oops');
assert.equal(extractApiMessage('raw'), 'raw');

console.log('query-service utils tests passed');
