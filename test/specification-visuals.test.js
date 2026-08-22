import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualSpecification, choicesForVisualRow, componentIcon, proposalRowNeedsAnswer, VISUAL_COMPONENTS, visualSelectionText } from '../js/specificationVisuals.js';

test('boiler SVG grammar uses the mandatory composable mappings', () => {
  assert.match(componentIcon('boiler', 'regular'), /data-primitives="flame"/);
  assert.match(componentIcon('boiler', 'system'), /data-primitives="flame gauge"/);
  assert.match(componentIcon('boiler', 'combi'), /data-primitives="tap flame gauge"/);
  assert.doesNotMatch(componentIcon('boiler', 'regular'), /gauge/);
  assert.match(componentIcon('boiler'), /boiler-answer-required/);
});

test('flue SVG grammar preserves circle fanned and square balanced mapping', () => {
  assert.match(componentIcon('flue', 'fanned'), /data-primitives="circle-fanned"/);
  assert.match(componentIcon('flue', 'fanned'), /<circle cx="24" cy="24" r="16"/);
  assert.match(componentIcon('flue', 'balanced'), /data-primitives="square-balanced"/);
  assert.match(componentIcon('flue', 'balanced'), /<rect x="8" y="8" width="32" height="32"/);
});

test('visual specification only uses the selected proposal for action state', () => {
  const interpretation = {
    sharedFacts: [{ id:'existing', category:'Existing system', text:'Existing system boiler.', evidenceQuote:'Existing system boiler.' }],
    options: [
      { id:'combi', facts:[{ id:'c', category:'Gas', text:'Upgrade gas supply for combi option.' }] },
      { id:'system', facts:[{ id:'s1', category:'Boiler', text:'Replace with a system boiler in the existing position.' }, { id:'s2', category:'Gas', text:'Existing gas supply is acceptable for the selected system boiler.' }] }
    ]
  };
  const rows = buildVisualSpecification(interpretation, interpretation.options[1]);
  assert.equal(rows.find(row => row.component === 'boiler').subtype, 'system');
  assert.equal(rows.find(row => row.component === 'boiler').action, 'Replace');
  assert.equal(rows.find(row => row.component === 'gas').action, 'Retain');
  assert.doesNotMatch(JSON.stringify(rows), /Upgrade gas supply/);
});

test('flue location action remains separate from the flue type icon', () => {
  const interpretation = { sharedFacts: [], options: [] };
  const option = { id:'selected', facts:[{ id:'f', category:'Flue', text:'Install fanned flue through a new hole.' }] };
  const row = buildVisualSpecification(interpretation, option).find(item => item.component === 'flue');
  assert.equal(row.subtype, 'fanned');
  assert.equal(row.action, 'New hole');
});

test('a grounded flue does not offer invented alternative designs', () => {
  const row = { component:'flue' };
  assert.deepEqual(choicesForVisualRow(row, 'type', VISUAL_COMPONENTS.flue.typeChoices, 'fanned'), [['fanned','Fanned']]);
  assert.deepEqual(choicesForVisualRow(row, 'action', VISUAL_COMPONENTS.flue.actions, 'Same hole'), [['Same hole','Existing opening']]);
});

test('powerflush uses a machine primitive rather than a generic droplet', () => {
  assert.match(componentIcon('powerflush'), /data-primitives="powerflush"/);
  assert.doesNotMatch(componentIcon('powerflush'), /data-primitives="condensate"/);
});

test('shared confirmed actions are not downgraded to unresolved', () => {
  const interpretation = { sharedFacts: [
    { id:'gas', category:'Gas supply', text:'Existing gas supply is adequate for the selected system boiler.' },
    { id:'scaffold', category:'Access', text:'Scaffold is required for flue access.' },
    { id:'condensate', category:'Condensate', text:'A new condensate pipe is needed.' }
  ] };
  const rows = buildVisualSpecification(interpretation, { id:'selected', facts:[] });
  assert.equal(rows.find(row => row.component === 'gas').action, 'Retain');
  assert.equal(rows.find(row => row.component === 'scaffold').action, 'Include');
  assert.equal(rows.find(row => row.component === 'condensate').action, 'New');
});

test('shared facts fill missing selected-option actions without overriding proposal facts', () => {
  const interpretation = { sharedFacts:[{ id:'shared', category:'Condensate', text:'A new condensate pipe is needed.' }] };
  const option = { id:'selected', facts:[{ id:'route', category:'Condensate', text:'Suggested route follows the gas supply into the outbuilding.' }] };
  const row = buildVisualSpecification(interpretation, option).find(item => item.component === 'condensate');
  assert.equal(row.action, 'New');
  assert.deepEqual(row.facts.map(item => item.id), ['route', 'shared']);
});

test('only boiler and flue require a displayed type', () => {
  const interpretation = { sharedFacts:[
    { id:'controls', category:'Controls', text:'Controls were discussed.' },
    { id:'boiler', category:'Boiler', text:'Replace boiler.' }
  ] };
  const rows = buildVisualSpecification(interpretation, { id:'selected', facts:[] });
  assert.equal(rows.find(row => row.component === 'control').typeRequired, false);
  assert.equal(rows.find(row => row.component === 'boiler').typeRequired, true);
});

test('shared rejected boiler wording cannot override selected boiler type', () => {
  const interpretation = { sharedFacts:[
    { id:'shared-combi', category:'Gas', text:'The gas supply is inadequate for the rejected combi option.' }
  ] };
  const option = { id:'system', facts:[
    { id:'selected-system', category:'Boiler', text:'Replace with the same type system boiler.' }
  ] };
  const boiler = buildVisualSpecification(interpretation, option).find(row => row.component === 'boiler');
  assert.equal(boiler.subtype, 'system');
});

test('negated upgrade is displayed as retain rather than replace', () => {
  const option = { id:'system', facts:[
    { id:'gas', category:'Gas', text:'No need to upgrade the gas supply for a system boiler.' }
  ] };
  const gas = buildVisualSpecification({ sharedFacts:[] }, option).find(row => row.component === 'gas');
  assert.equal(gas.action, 'Retain');
});

test('component tiles do not attach route references to the gas evidence', () => {
  const option = { id:'system', facts:[
    { id:'gas', category:'Gas', text:'Existing gas supply is adequate for the system boiler.' },
    { id:'route', category:'Condensate', text:'Condensate follows the same route as the gas supply.' }
  ] };
  const gas = buildVisualSpecification({ sharedFacts:[] }, option).find(row => row.component === 'gas');
  assert.deepEqual(gas.facts.map(fact => fact.id), ['gas']);
});

test('a gas fact naming the selected boiler cannot override the boiler action', () => {
  const option = { id:'system', facts:[
    { id:'boiler', category:'Proposal', text:'Replace the existing system boiler with a new system boiler in the same location.' },
    { id:'gas', category:'Gas supply', text:'No need to upgrade the gas supply for a system boiler.' }
  ] };
  const boiler = buildVisualSpecification({ sharedFacts:[] }, option).find(row => row.component === 'boiler');
  assert.equal(boiler.action, 'Replace');
  assert.deepEqual(boiler.facts.map(fact => fact.id), ['boiler']);
});

test('visual specification exposes confirmed gas size and persisted visual corrections', () => {
  const interpretation = { sharedFacts:[{ id:'gas', category:'Gas supply', text:'Existing 22 mm gas pipe is adequate.' }] };
  const checklist = { items:[
    { visualComponent:'boiler', visualField:'type', visualValue:'system' },
    { visualComponent:'boiler', visualField:'action', visualValue:'Replace' },
    { visualComponent:'gas', visualField:'action', visualValue:'Retain' }
  ] };
  const option = { id:'selected', facts:[{ id:'boiler', category:'Proposal', text:'Replace the existing system boiler.' }] };
  const rows = buildVisualSpecification(interpretation, option, checklist);
  assert.equal(rows.find(row => row.component === 'boiler').subtype, 'system');
  assert.equal(rows.find(row => row.component === 'boiler').action, 'Replace');
  assert.equal(rows.find(row => row.component === 'gas').specification, '22 mm');
  assert.equal(rows.find(row => row.component === 'gas').action, 'Retain');
});

test('existing combi is context and never silently becomes the proposed boiler type', () => {
  const interpretation = { sharedFacts:[
    { id:'existing-combi', category:'Existing system', text:'Existing combi boiler.' }
  ] };
  const boiler = buildVisualSpecification(interpretation, { id:'selected', facts:[] }).find(row => row.component === 'boiler');
  assert.equal(boiler.existingSubtype, 'combi');
  assert.equal(boiler.subtype, '');
  assert.equal(boiler.action, 'Unresolved');
  assert.equal(proposalRowNeedsAnswer(boiler), true);
});

test('existing boiler does not overwrite an explicitly selected different proposal type', () => {
  const interpretation = { sharedFacts:[
    { id:'existing-combi', category:'Existing system', text:'Existing combi boiler.' }
  ] };
  const option = { id:'selected', facts:[
    { id:'proposal-system', category:'Proposal', text:'Replace with a system boiler in the same position.' }
  ] };
  const boiler = buildVisualSpecification(interpretation, option).find(row => row.component === 'boiler');
  assert.equal(boiler.existingSubtype, 'combi');
  assert.equal(boiler.subtype, 'system');
  assert.equal(boiler.action, 'Replace');
});

test('gas size is useful but optional when existing supply is confirmed adequate', () => {
  const option = { id:'selected', facts:[
    { id:'gas', category:'Gas supply', text:'The existing gas supply is adequate for the selected proposal.' }
  ] };
  const gas = buildVisualSpecification({ sharedFacts:[] }, option).find(row => row.component === 'gas');
  assert.equal(gas.action, 'Retain');
  assert.equal(gas.subtype, '');
  assert.equal(gas.typeRequired, false);
  assert.equal(proposalRowNeedsAnswer(gas), false);
  assert.match(visualSelectionText('gas', 'action', 'Retain'), /adequate for this proposal/i);
});

test('gas adequacy is mandatory even when no gas evidence was captured', () => {
  const rows = buildVisualSpecification({ sharedFacts:[] }, { id:'selected', facts:[] });
  const gas = rows.find(row => row.component === 'gas');
  assert(gas);
  assert.equal(gas.action, 'Unresolved');
  assert.equal(proposalRowNeedsAnswer(gas), true);
  assert.deepEqual(VISUAL_COMPONENTS.gas.actions, [['Retain','Existing gas supply is adequate'],['Replace','Upgrade or replace gas supply']]);
});

test('gas alteration requires the replacement size while adequate existing gas does not', () => {
  const replace = buildVisualSpecification({ sharedFacts:[] }, { id:'selected', facts:[
    { id:'gas', category:'Gas', text:'Upgrade the gas supply for the selected proposal.' }
  ] }).find(row => row.component === 'gas');
  assert.equal(replace.action, 'Replace');
  assert.equal(replace.typeRequired, true);
  assert.equal(proposalRowNeedsAnswer(replace), true);

  const corrected = buildVisualSpecification({ sharedFacts:[] }, { id:'selected', facts:[
    { id:'gas', category:'Gas', text:'Upgrade the gas supply for the selected proposal.' }
  ] }, { items:[{ visualComponent:'gas', visualField:'type', visualValue:'28 mm' }] }).find(row => row.component === 'gas');
  assert.equal(corrected.subtype, '28 mm');
  assert.equal(proposalRowNeedsAnswer(corrected), false);
});

test('completed survey editor offers no unresolved or not-established outcome', () => {
  const labels = Object.values(VISUAL_COMPONENTS).flatMap(component => component.actions || []).flatMap(choice => Array.isArray(choice) ? choice : [choice]);
  assert(!labels.some(value => /unresolved|not established/i.test(value)));
});
