import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationSafeguards, mergeSafeguards, unresolvedSafeguards } from '../js/handoverSafeguards.js';
import { confirmedChecklistItems } from '../js/confirmationState.js';

const proposal = { id: 'option-1', facts: [
  { category: 'Boiler', text: 'Replace existing boiler with system boiler in the same location.' },
  { category: 'Pipe route', text: 'Run heating pipes behind boiler and above window.' }
] };

test('missing boiler subjects are shown as non-blocking requests for information', () => {
  const interpretation = { sharedFacts: [
    { category: 'Customer needs', text: 'Large family needs improved hot water.' },
    { category: 'Existing system', text: 'Existing combi boiler.' }
  ] };
  const safeguards = communicationSafeguards(interpretation, proposal, []);
  assert(safeguards.some(item => item.id === 'safeguard-flue' && item.kind === 'informationGap'));
  assert.equal(safeguards.find(item => item.id === 'safeguard-flue').responseOptions, undefined);
  assert(safeguards.some(item => item.id === 'safeguard-flue-photo' && item.includeInNotes === false));
  assert.equal(unresolvedSafeguards({ items: safeguards }).length, 0);
  assert.equal(safeguards.find(item => item.id === 'safeguard-flue').includeInNotes, false);
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

test('missing-information cards remain audit-only and never enter notes', () => {
  const state = { items: [
    { id: 'safeguard-flue', text: 'I could not establish flue information.', originalText: 'same', checked: false, kind: 'informationGap', includeInNotes: false, targetSection: 'Flue' },
    { id: 'safeguard-flue-photo', text: 'No flue photo attached.', originalText: 'same', checked: false, kind: 'informationGap', includeInNotes: false, targetSection: 'Flue' }
  ] };
  assert.deepEqual(confirmedChecklistItems(state).map(item => item.text), []);
  assert.equal(unresolvedSafeguards(state).length, 0);
});

test('new safeguards merge without overwriting persisted surveyor choices', () => {
  const existing = { items: [{ id: 'safeguard-flue', text: 'Surveyor flue wording', checked: true }] };
  const merged = mergeSafeguards(existing, [{ id: 'safeguard-flue', text: 'Generated wording', checked: false, responseOptions: ['Reuse route', 'Enter manually'] }, { id: 'safeguard-gas', text: 'Gas missing', checked: false }]);
  assert.equal(merged.items.find(item => item.id === 'safeguard-flue').text, 'Surveyor flue wording');
  assert.deepEqual(merged.items.find(item => item.id === 'safeguard-flue').responseOptions, ['Reuse route', 'Enter manually']);
  assert(merged.items.some(item => item.id === 'safeguard-gas'));
});

test('raw transcript evidence prevents a false customer-needs gap', () => {
  const interpretation = { sharedFacts: [{ category: 'Existing system', text: 'Existing combi boiler.' }] };
  const safeguards = communicationSafeguards(interpretation, proposal, [], 'The customer wants improved hot water for their large family.');
  assert(!safeguards.some(item => item.id === 'safeguard-customer-needs'));
});

test('stale missing-information cards disappear once evidence establishes the subject', () => {
  const existing = { items: [
    { id: 'safeguard-customer-needs', kind: 'informationGap', text: 'I could not establish customer wants.' },
    { id: 'generated-1', kind: 'evidenceFact', text: 'Customer wants reliable heating.' }
  ] };
  const merged = mergeSafeguards(existing, []);
  assert(!merged.items.some(item => item.id === 'safeguard-customer-needs'));
  assert(merged.items.some(item => item.id === 'generated-1'));
});
