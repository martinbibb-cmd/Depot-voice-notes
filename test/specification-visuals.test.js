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
  const row = buildVisualSpecification(interpretation, option)[0];
  assert.equal(row.subtype, 'fanned');
  assert.equal(row.action, 'New hole');
});

test('powerflush uses a machine primitive rather than a generic droplet', () => {
  assert.match(componentIcon('powerflush'), /data-primitives="powerflush"/);
  assert.doesNotMatch(componentIcon('powerflush'), /data-primitives="condensate"/);
});
