import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedChecklistItems, initialiseChecklist, restoreChecklists, serialiseChecklists } from '../js/confirmationState.js';

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
