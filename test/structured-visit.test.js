import test from 'node:test';
import assert from 'node:assert/strict';
import { hasStructuredSurvey, interpretationFromStructuredVisit, structuredEvidence } from '../js/structuredVisit.js';

function payload() {
  return {
    schemaVersion: 3,
    structuredVisit: {
      existing: [{ id: 'existing-boiler', section: 'boiler', type: 'System', position: 'Kitchen cupboard', completion: 'complete' }],
      customer: [
        { id: 'want', kind: 'want', text: 'Gain loft space', origin: 'customerStatement', confirmed: true },
        { id: 'need', kind: 'derivedNeed', text: 'Retain reliable bath and shower hot water', origin: 'derivedRequirement', confirmed: true },
        { id: 'unconfirmed', kind: 'preference', text: 'Possibly hide every pipe', origin: 'customerStatement', confirmed: false }
      ],
      proposals: [
        { id: 'system', name: 'Option 1', isSelected: true, components: [
          { id: 'boiler', section: 'boiler', type: 'System', action: 'replace', positionOrRoute: 'Same position', selectedNotes: [] },
          { id: 'gas', section: 'gas', specification: '22 mm', action: 'retain', selectedNotes: [{ id: 'note', libraryID: 'gas.retain', text: 'Retain existing gas supply.', confirmed: true }] }
        ] },
        { id: 'combi', name: 'Option 2', isSelected: false, components: [
          { id: 'boiler2', section: 'boiler', type: 'Combi', action: 'replace', selectedNotes: [] },
          { id: 'gas2', section: 'gas', specification: '28 mm', action: 'replace', selectedNotes: [] }
        ] }
      ], evidence: []
    }
  };
}

test('structured survey is a primary interpretation source with Wants and Needs preserved', () => {
  const input = payload();
  assert.equal(hasStructuredSurvey(input), true);
  const result = interpretationFromStructuredVisit(input);
  assert.equal(result.sourceMode, 'structuredVisit');
  assert.ok(result.sharedFacts.some(fact => fact.category === 'Want' && fact.text === 'Gain loft space'));
  assert.ok(result.sharedFacts.some(fact => fact.category === 'Derived Need' && fact.text.includes('bath and shower')));
  assert.ok(!result.sharedFacts.some(fact => fact.text.includes('hide every pipe')));
});

test('proposal options remain isolated and approved notes remain grounded selections', () => {
  const result = interpretationFromStructuredVisit(payload());
  const system = result.options.find(option => option.id === 'system');
  const combi = result.options.find(option => option.id === 'combi');
  assert.ok(system.facts.some(fact => fact.text.includes('22 mm')));
  assert.ok(system.facts.some(fact => fact.text === 'Retain existing gas supply.'));
  assert.ok(!system.facts.some(fact => fact.text.includes('28 mm')));
  assert.ok(combi.facts.some(fact => fact.text.includes('28 mm')));
  assert.equal(system.status, 'preferred');
  assert.equal(combi.status, 'alternative');
});

test('structured evidence is readable audit material without requiring a transcript', () => {
  const lines = structuredEvidence(payload());
  assert.ok(lines.some(line => line.includes('Existing — Boiler: System')));
  assert.ok(lines.some(line => line.includes('Option 1 [selected]')));
  assert.ok(lines.some(line => line.includes('approved note: Retain existing gas supply.')));
});
