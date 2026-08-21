import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualSpecification, componentIcon } from '../js/specificationVisuals.js';

test('boiler SVG grammar uses the mandatory composable mappings', () => {
  assert.match(componentIcon('boiler', 'regular'), /data-primitives="flame"/);
  assert.match(componentIcon('boiler', 'system'), /data-primitives="flame gauge"/);
  assert.match(componentIcon('boiler', 'combi'), /data-primitives="tap flame gauge"/);
  assert.doesNotMatch(componentIcon('boiler', 'regular'), /gauge/);
  assert.match(componentIcon('boiler'), /boiler-unresolved/);
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
