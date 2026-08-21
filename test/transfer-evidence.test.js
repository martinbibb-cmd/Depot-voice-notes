import test from 'node:test';
import assert from 'node:assert/strict';
import { trustworthyTransferredFacts } from '../js/transferEvidence.js';

test('legacy transfers cannot promote unconfirmed AI candidates into survey evidence', () => {
  const payload = { schemaVersion: 1, facts: [
    { text: 'Pump is an impala in the matrix', state: 'aiCandidate' },
    { text: 'Standing pressure 2.5 bar', state: 'capturedFact' }
  ] };
  assert.deepEqual(trustworthyTransferredFacts(payload).map(item => item.text), ['Standing pressure 2.5 bar']);
});

test('schema version two trusts the native evidence boundary', () => {
  const payload = { schemaVersion: 2, facts: [{ text: 'Confirmed candidate', state: 'aiCandidate' }] };
  assert.equal(trustworthyTransferredFacts(payload).length, 1);
});
