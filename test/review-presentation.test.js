import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVisitBrief, confirmationGroup, confirmationPriority, evidenceStateLabel } from '../js/reviewPresentation.js';

test('end-of-visit brief restores the decision narrative without inventing content', () => {
  const interpretation = {
    sharedFacts: [
      { id: 'want', category: 'Customer wants and needs', text: 'Customer wants cupboard space.' },
      { id: 'flow', category: 'Measured water flow', text: 'Approximately 10 L/min unrestricted.' },
      { id: 'existing', category: 'Existing system', text: 'Existing system boiler has failed.' }
    ],
    options: [
      { id: 'combi', status: 'discussed', facts: [{ id: 'gas', text: 'Gas supply is inadequate for the combi option.' }] },
      { id: 'system', status: 'preferred', facts: [{ id: 'selected', text: 'Replace with a system boiler in the existing position.' }] }
    ],
    rejectedAlternatives: [{ id: 'rejected', text: 'Combi option rejected.', reason: 'Water performance was marginal.' }],
    uncertainties: [{ id: 'uncertain', text: 'System cleanliness was not established.' }]
  };
  const brief = Object.fromEntries(buildVisitBrief(interpretation).map(section => [section.id, section.items]));
  assert.deepEqual(brief.customer.map(x => x.id), ['want']);
  assert.deepEqual(brief.proposal.map(x => x.id), ['selected']);
  assert(brief.alternatives.some(x => x.id === 'gas'));
  assert(brief.measurements.some(x => x.id === 'flow'));
  assert.deepEqual(brief.missing.map(x => x.id), ['uncertain']);
});

test('confirmation presentation puts missing, uncertain and decision items first', () => {
  const missing = { kind: 'informationGap', text: 'Flue access has not been established.' };
  const uncertain = { evidenceState: 'uncertain', text: 'The component name is unclear.' };
  const decision = { text: 'Customer wants improved hot water.', category: 'Customer wants' };
  const supporting = { text: 'Existing pump photographed.', category: 'Existing equipment' };
  assert.equal(confirmationGroup(missing), 'unresolved');
  assert.equal(confirmationGroup(uncertain), 'unresolved');
  assert.equal(confirmationGroup(decision), 'decision');
  assert(confirmationPriority(missing) < confirmationPriority(decision));
  assert(confirmationPriority(decision) < confirmationPriority(supporting));
  assert.equal(evidenceStateLabel(missing), 'MISSING');
  assert.equal(evidenceStateLabel({ evidenceSource: 'capturedEvidence', text: '2.5 bar' }), 'MEASURED');
});

test('suggested work is visibly different and never presented as captured fact', () => {
  const suggestion = { evidenceState: 'derivedSuggestion', text: 'Scaffold may be required.' };
  assert.equal(evidenceStateLabel(suggestion), 'SUGGESTED WORK');
  assert.equal(confirmationGroup(suggestion), 'work');
});

test('system-boiler/combi visit becomes a decision brief that can be checked before leaving', () => {
  const interpretation = JSON.parse(readFileSync(new URL('./fixtures/system-boiler-combi.json', import.meta.url)));
  const selected = interpretation.options.find(option => option.status === 'preferred');
  const brief = Object.fromEntries(buildVisitBrief(interpretation, selected).map(section => [section.id, section.items]));
  const text = id => brief[id].map(item => `${item.text} ${item.reason || ''}`).join(' ');
  assert.match(text('customer'), /gain cupboard or loft space/i);
  assert.match(text('existing'), /system boiler.*boiler has failed/i);
  assert.match(text('existing'), /bath and shower/i);
  assert.match(text('measurements'), /approximately 10 L\/min unrestricted/i);
  assert.match(text('alternatives'), /inadequate for the combi option/i);
  assert.match(text('proposal'), /system-boiler replacement/i);
  assert.match(text('work'), /condensate needs a new route/i);
  assert.match(text('restrictions'), /scaffold.*sloping front garden/i);
  assert.doesNotMatch(text('proposal'), /upgrade.*gas/i);
});
