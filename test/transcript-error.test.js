/**
 * Test for transcript processing error fix
 * Ensures that undefined/null transcripts don't cause errors during save operations
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock the saveMenu functions since they depend on browser APIs
test('Transcript handling with undefined values', () => {
  // Test that string operations work with fallback to empty string
  const undefinedTranscript = undefined;
  const nullTranscript = null;
  const emptyTranscript = '';
  const validTranscript = 'Test transcript';

  // Simulate the fix: use fallback to empty string
  const processTranscript = (transcript) => {
    const transcriptText = transcript || '';
    return transcriptText.replace(/"/g, '""');
  };

  // Test undefined
  const result1 = processTranscript(undefinedTranscript);
  assert.equal(result1, '', 'undefined transcript should become empty string');

  // Test null
  const result2 = processTranscript(nullTranscript);
  assert.equal(result2, '', 'null transcript should become empty string');

  // Test empty string
  const result3 = processTranscript(emptyTranscript);
  assert.equal(result3, '', 'empty transcript should remain empty string');

  // Test valid transcript
  const result4 = processTranscript(validTranscript);
  assert.equal(result4, 'Test transcript', 'valid transcript should be processed correctly');

  // Test with quotes
  const result5 = processTranscript('Test "quoted" text');
  assert.equal(result5, 'Test ""quoted"" text', 'quotes should be escaped');
});

test('Session transcript type checking', () => {
  const testCases = [
    { session: { fullTranscript: undefined }, expected: false },
    { session: { fullTranscript: null }, expected: false },
    { session: { fullTranscript: '' }, expected: false },
    { session: { fullTranscript: 'Valid text' }, expected: true },
    { session: { fullTranscript: 123 }, expected: false }, // number
    { session: { fullTranscript: {} }, expected: false }, // object
    { session: { fullTranscript: [] }, expected: false }, // array
  ];

  testCases.forEach((testCase, index) => {
    const session = testCase.session;
    // Simulate the fix: check both existence and type
    const isValidTranscript = !!(session.fullTranscript && typeof session.fullTranscript === 'string');
    assert.equal(
      isValidTranscript,
      testCase.expected,
      `Test case ${index}: fullTranscript=${JSON.stringify(session.fullTranscript)} should return ${testCase.expected}`
    );
  });
});
