import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationSafeguards, derivedWorkSuggestions, mergeSafeguards, unresolvedSafeguards } from '../js/handoverSafeguards.js';
import { confirmedChecklistItems } from '../js/confirmationState.js';

const proposal = { id: 'option-1', facts: [
  { category: 'Boiler', text: 'Replace existing boiler with system boiler in the same location.' },
  { category: 'Pipe route', text: 'Run heating pipes behind boiler and above window.' }
] };

test('a complete survey does not create absence-based information gaps', () => {
  const interpretation = { sharedFacts: [
    { category: 'Customer needs', text: 'Large family needs improved hot water.' },
    { category: 'Existing system', text: 'Existing combi boiler.' }
  ] };
  const safeguards = communicationSafeguards(interpretation, proposal, []);
  assert.deepEqual(safeguards, []);
  assert.equal(unresolvedSafeguards({ items: safeguards }).length, 0);
});

test('a transcript interruption creates one blocking capture-integrity check', () => {
  const interpretation = { sharedFacts: [
    { category: 'Customer needs', text: 'Customer needs reliable heating.' },
    { category: 'Existing system', text: 'Existing regular boiler.' },
    { category: 'Flue', text: 'Flue rises vertically then exits horizontally above lintel.' }
  ] };
  const safeguards = communicationSafeguards(interpretation, proposal, [], 'Discussion [BLANK_AUDIO] resumed');
  assert.equal(safeguards.length, 1);
  assert.equal(safeguards[0].id, 'safeguard-capture-integrity');
  assert.equal(safeguards[0].kind, 'informationGap');
  assert.equal(safeguards[0].includeInNotes, false);
  assert(!/unresolved|not established/i.test(`${safeguards[0].text} ${safeguards[0].reason}`));
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

test('raw transcript content does not trigger generic absence cards', () => {
  const interpretation = { sharedFacts: [{ category: 'Existing system', text: 'Existing combi boiler.' }] };
  const safeguards = communicationSafeguards(interpretation, proposal, [], 'The customer wants improved hot water for their large family.');
  assert.deepEqual(safeguards, []);
});

test('canonical derived Needs prevent the false-empty Need safeguard', () => {
  const interpretation = { sharedFacts: [], customerIntent: { wants: [], needs: [{ category: 'Customer need', text: 'The proposed solution needs to support bath and shower use.' }] } };
  const safeguards = communicationSafeguards(interpretation, { facts: [] }, [], '');
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

test('derived work is a proposal-scoped unchecked candidate with causal provenance', () => {
  const interpretation = { sharedFacts: [] };
  const option = { id: 'system', facts: [{ id: 'flue-access', category: 'Flue', text: 'Flue access is prevented by the sloping garden and normal ladder access is not possible.', evidenceQuote: 'sloping garden means normal ladder access is not possible for the flue' }] };
  const items = derivedWorkSuggestions(interpretation, option);
  const scaffold = items.find(item => /Scaffold/.test(item.text));
  assert(scaffold);
  assert.equal(scaffold.checked, false);
  assert.equal(scaffold.parentFactId, 'flue-access');
  assert.match(scaffold.evidenceRelation, /sloping garden/);
  assert.equal(confirmedChecklistItems({ items }).length, 0);
});

test('derived work avoids generic false positives and remains isolated by option', () => {
  const quietOption = { id: 'same-place', facts: [{ id: 'b', category: 'Boiler', text: 'Replace boiler in the same position.', evidenceQuote: 'same position' }] };
  const routedOption = { id: 'new-route', facts: [{ id: 'c', category: 'Condensate', text: 'Condensate route goes through the outbuilding to the soakaway.', evidenceQuote: 'through the outbuilding to the soakaway' }] };
  assert.deepEqual(derivedWorkSuggestions({ sharedFacts: [] }, quietOption), []);
  assert(derivedWorkSuggestions({ sharedFacts: [] }, routedOption).some(item => /condensate pipework/i.test(item.text)));
});
