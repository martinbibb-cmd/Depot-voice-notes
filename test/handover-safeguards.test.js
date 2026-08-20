import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationSafeguards, mergeSafeguards, unresolvedSafeguards } from '../js/handoverSafeguards.js';
import { confirmedChecklistItems } from '../js/confirmationState.js';

const proposal = { id: 'option-1', facts: [
  { category: 'Boiler', text: 'Replace existing boiler with system boiler in the same location.' },
  { category: 'Pipe route', text: 'Run heating pipes behind boiler and above window.' }
] };

test('boiler proposal cannot look complete when flue and other core subjects are missing', () => {
  const interpretation = { sharedFacts: [
    { category: 'Customer needs', text: 'Large family needs improved hot water.' },
    { category: 'Existing system', text: 'Existing combi boiler.' }
  ] };
  const safeguards = communicationSafeguards(interpretation, proposal, []);
  assert(safeguards.some(item => item.id === 'safeguard-flue' && item.kind === 'communicationGap'));
  assert(safeguards.some(item => item.id === 'safeguard-flue-photo' && item.includeInNotes === false));
  assert(unresolvedSafeguards({ items: safeguards }).length >= 2);
});

test('recorded flue fact and tagged photograph satisfy both flue safeguards', () => {
  const interpretation = { sharedFacts: [
    { category: 'Customer needs', text: 'Customer needs reliable heating.' },
    { category: 'Existing system', text: 'Existing regular boiler.' },
    { category: 'Flue', text: 'Flue rises vertically then exits horizontally above lintel.' }
  ] };
  const safeguards = communicationSafeguards(interpretation, proposal, [{ subject: 'Flue', caption: 'Proposed terminal route' }]);
  assert(!safeguards.some(item => item.id === 'safeguard-flue'));
  assert(!safeguards.some(item => item.id === 'safeguard-flue-photo'));
});

test('acknowledged photo warning remains audit-only while unresolved fact enters notes', () => {
  const state = { items: [
    { id: 'safeguard-flue', text: 'TO CONFIRM: Flue information has not been recorded.', originalText: 'same', checked: true, kind: 'communicationGap', includeInNotes: true, targetSection: 'Flue' },
    { id: 'safeguard-flue-photo', text: 'No flue photo attached.', originalText: 'same', checked: true, kind: 'evidenceGap', includeInNotes: false, targetSection: 'Flue' }
  ] };
  assert.deepEqual(confirmedChecklistItems(state).map(item => item.text), ['TO CONFIRM: Flue information has not been recorded.']);
  assert.equal(unresolvedSafeguards(state).length, 0);
});

test('new safeguards merge without overwriting persisted surveyor choices', () => {
  const existing = { items: [{ id: 'safeguard-flue', text: 'Surveyor flue wording', checked: true }] };
  const merged = mergeSafeguards(existing, [{ id: 'safeguard-flue', text: 'Generated wording', checked: false }, { id: 'safeguard-gas', text: 'Gas missing', checked: false }]);
  assert.equal(merged.items.find(item => item.id === 'safeguard-flue').text, 'Surveyor flue wording');
  assert(merged.items.some(item => item.id === 'safeguard-gas'));
});
