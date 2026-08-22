import test from 'node:test';
import assert from 'node:assert/strict';
import { addSurveyorProposal, proposalMissing } from '../js/proposalWorkflow.js';
import { buildVisualSpecification, proposalRowNeedsAnswer } from '../js/specificationVisuals.js';

test('an interpretation with no proposal is a required workflow gap', () => {
  assert.equal(proposalMissing({ options: [] }), true);
  assert.equal(proposalMissing({ options: [{ id: 'one' }] }), false);
});

test('surveyor can create an empty proposal without copying Existing into Proposed', () => {
  const interpretation = {
    sharedFacts: [{ id: 'existing', category: 'Existing Boiler', text: 'Existing combi boiler.', evidenceQuote: 'Existing combi boiler.' }],
    options: []
  };
  const option = addSurveyorProposal(interpretation, 'visit-option-1');
  assert.equal(option.surveyorCreated, true);
  assert.deepEqual(option.facts, []);
  assert.equal(option.status, 'preferred');

  const rows = buildVisualSpecification(interpretation, option);
  const boiler = rows.find(row => row.component === 'boiler');
  assert.equal(boiler.existingSubtype, 'combi');
  assert.equal(boiler.subtype, '');
  assert.equal(boiler.action, 'Unresolved');
  assert.equal(proposalRowNeedsAnswer(boiler), true);
});

test('a surveyor-created proposal exposes core decisions but selects none', () => {
  const interpretation = { sharedFacts: [], options: [] };
  const option = addSurveyorProposal(interpretation);
  const rows = buildVisualSpecification(interpretation, option);
  assert.deepEqual(rows.map(row => row.component), ['boiler', 'flue', 'control', 'gas', 'filter', 'condensate']);
  assert.ok(rows.every(row => row.action === 'Unresolved'));
});
