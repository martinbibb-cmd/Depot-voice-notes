import test from 'node:test';
import assert from 'node:assert/strict';

import { validateVisitPayload } from '../speccheck-transfer.js';

test('SpecCheck transfer accepts chronological transcript plus structured capture', () => {
  assert.equal(validateVisitPayload({
    nickname: '50824934',
    sourceVisitId: '9f74e5e0-7833-4a72-a322-9c667647f895',
    transcriptParts: [{ text: 'Customer wants reliable heating.' }],
    waterPressureTests: [{ standingPressureBar: 2.7, flowLitresPerMinute: 13.9 }],
    rooms: [{ name: 'Kitchen', wallCount: 8 }]
  }), null);
});

test('SpecCheck transfer rejects a malformed native Visit identity', () => {
  assert.equal(validateVisitPayload({ nickname: '50824934', sourceVisitId: 'not-a-uuid', transcript: 'survey' }), 'sourceVisitId must be a UUID');
});

test('SpecCheck transfer refuses a capture with no transcript evidence', () => {
  assert.equal(validateVisitPayload({ nickname: '50824934', notes: ['boiler'] }), 'transcript or structuredVisit required');
});

test('schema 3 accepts a structured survey without a transcript', () => {
  assert.equal(validateVisitPayload({
    schemaVersion: 3,
    nickname: 'Structured visit',
    sourceVisitId: '9f74e5e0-7833-4a72-a322-9c667647f895',
    structuredVisit: { existing: [], customer: [], proposals: [{ name: 'Option 1', components: [] }] }
  }), null);
});

test('SpecCheck transfer keeps anonymous nickname mandatory', () => {
  assert.equal(validateVisitPayload({ nickname: ' ', transcript: 'survey' }), 'anonymous nickname required');
});
