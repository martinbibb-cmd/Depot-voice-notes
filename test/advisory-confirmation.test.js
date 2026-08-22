import test from 'node:test';
import assert from 'node:assert/strict';
import { advisoryDecision, setAdvisoryDecision } from '../js/confirmationState.js';

test('customer advisory can be explicitly retained as an outstanding point', () => {
  const state = { items: [] };
  setAdvisoryDecision(state, 'option:shower', 'outstanding');
  assert.equal(advisoryDecision(state, 'option:shower').decision, 'outstanding');
  assert.equal(advisoryDecision(state, 'option:shower').evidenceSource, 'surveyorConfirmation');
});

test('customer advisory stores the surveyor confirmed answer', () => {
  const state = { items: [] };
  setAdvisoryDecision(state, 'option:discharge', 'resolved', 'New discharge route to the side elevation.');
  assert.deepEqual(
    { decision: advisoryDecision(state, 'option:discharge').decision, answer: advisoryDecision(state, 'option:discharge').answer },
    { decision: 'resolved', answer: 'New discharge route to the side elevation.' }
  );
});
