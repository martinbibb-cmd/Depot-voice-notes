import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVisualSelection, confirmedChecklistItems, initialiseChecklist, restoreChecklists, serialiseChecklists, visualSelection } from '../js/confirmationState.js';
import { buildDepotSections, buildHandoverDocuments } from '../js/pipelineInvariants.js';

test('only checked proposal suggestions reach final note evidence', () => {
  const state = { items: [
    { text: 'Remove and refit boiler boxing', originalText: 'Remove and refit boiler boxing', targetSection: 'Restrictions to work', checked: true, manual: false },
    { text: 'Lift flooring', originalText: 'Lift flooring', targetSection: 'Disruption', checked: false, manual: false }
  ] };
  assert.deepEqual(confirmedChecklistItems(state).map(item => item.text), ['Remove and refit boiler boxing']);
});

test('proposal checklists remain independent and preserve edits and manual items', () => {
  const states = new Map([
    ['option-1', { items: [{ id: 'one', originalText: 'Visible pipework may remain', text: 'Pipework visible above kitchen window', checked: true, manual: false, targetSection: 'Disruption' }] }],
    ['option-2', { items: [{ id: 'two', originalText: 'Remove boxing', text: 'Remove boxing', checked: false, manual: false, targetSection: 'Restrictions to work' },
      { id: 'manual', originalText: 'Clear cupboard', text: 'Clear cupboard before arrival', checked: true, manual: true, targetSection: 'Customer actions' }] }]
  ]);
  const restored = restoreChecklists(JSON.parse(JSON.stringify(serialiseChecklists(states))));
  assert.equal(restored.get('option-1').items[0].text, 'Pipework visible above kitchen window');
  assert.equal(restored.get('option-2').items[1].manual, true);
  assert.deepEqual(confirmedChecklistItems(restored.get('option-2')).map(item => item.text), ['Clear cupboard before arrival']);
});

test('regeneration does not overwrite persisted surveyor choices', () => {
  const persisted = { items: [{ id: 'kept', originalText: 'AI wording', text: 'Surveyor wording', checked: true }] };
  const regenerated = { items: [{ id: 'new', originalText: 'Different AI wording', text: 'Different AI wording', checked: false }] };
  assert.strictEqual(initialiseChecklist(persisted, regenerated), persisted);
});

test('removed suggestions stay in the audit state but cannot reach notes', () => {
  const state = { items: [{ id: 'removed', originalText: 'Possible lifting', text: 'Possible lifting', checked: true, removed: true }] };
  assert.equal(state.items.length, 1);
  assert.deepEqual(confirmedChecklistItems(state), []);
});

test('visual controls write the persisted confirmation state consumed by notes', () => {
  const state = { items:[{ id:'old', factId:'old', text:'Retain existing boiler.', checked:true, targetSection:'New boiler and controls' }] };
  applyVisualSelection(state, { component:'boiler', field:'action', value:'Replace', text:'Replace existing boiler.', targetSection:'New boiler and controls', affectedFactIds:['old'], evidenceQuotes:['replace same type'] });
  assert.equal(visualSelection(state, 'boiler', 'action').visualValue, 'Replace');
  assert.equal(state.items.find(item => item.id === 'old').includeInNotes, false);
  assert.deepEqual(confirmedChecklistItems(state).map(item => item.text), ['Replace existing boiler.']);
  const restored = restoreChecklists(JSON.parse(JSON.stringify(serialiseChecklists(new Map([['option',state]]))))).get('option');
  assert.equal(visualSelection(restored, 'boiler', 'action').visualValue, 'Replace');
});

test('changing a visual state supersedes the previous correction without losing its audit record', () => {
  const state = { items:[] };
  applyVisualSelection(state, { component:'flue', field:'action', value:'Same hole', text:'Install flue through the existing opening.', targetSection:'Flue' });
  applyVisualSelection(state, { component:'flue', field:'action', value:'New hole', text:'Install flue through a new opening.', targetSection:'Flue' });
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].removed, true);
  assert.deepEqual(confirmedChecklistItems(state).map(item => item.text), ['Install flue through a new opening.']);
});

test('visual proposal changes flow into Depot notes and engineer handover', () => {
  const state = { items:[] };
  applyVisualSelection(state, { component:'flue', field:'type', value:'fanned', text:'Fanned flue.', targetSection:'Flue' });
  applyVisualSelection(state, { component:'flue', field:'action', value:'New hole', text:'Install flue through a new opening.', targetSection:'Flue' });
  const confirmed = confirmedChecklistItems(state);
  const depot = buildDepotSections(confirmed).find(section => section.section === 'Flue');
  const engineer = buildHandoverDocuments({ confirmedChecklistItems:confirmed }).engineer.find(section => section.heading === 'Flue');
  assert.match(depot.plainText, /Fanned flue/);
  assert.match(depot.plainText, /new opening/);
  assert.match(engineer.bullets.join(' '), /Fanned flue/);
  assert.match(engineer.bullets.join(' '), /new opening/);
});
